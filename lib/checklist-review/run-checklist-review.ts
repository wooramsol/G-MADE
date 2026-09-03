import { dedupeWarnings } from "@/lib/analysis-warnings";
import { isAiAnalysisError } from "@/lib/ai/analysis-error";
import type { UploadedFileSummary } from "@/lib/ai/uploaded-file";
import { buildEvaluationContext } from "@/lib/evaluation-context";
import { ensureProjectRecordFromSnapshot } from "@/lib/ensure-project-record";
import { hashPdfPages } from "@/lib/pdf/split-pdf";
import { addProjectChecklistReview, getProjectById, upsertProjectRecord } from "@/lib/project-store";
import {
  deleteSavedUploadFiles,
  readSavedUploadFile,
  saveUploadedFiles,
  storedRefsToProjectFiles,
  storedRefsToSavedFiles,
  toProjectFiles,
  type SavedUploadFile,
} from "@/lib/save-uploaded-files";
import type { StoredFileRef } from "@/lib/stored-file-ref";
import { isProjectTrashed } from "@/lib/trash";
import type { Project } from "@/lib/types";
import { isClaudeConfigured } from "./claude-call";
import { evaluateChecklistItems } from "./evaluate-items";
import { extractChecklistItems } from "./extract-items";
import { extractProjectMetrics } from "./extract-metrics";
import { hashFileBuffer } from "./file-fingerprint";
import { addUsage, estimateUsageSummary, mergeUsageByModel, type UsageByModel } from "./usage-cost";
import { MAX_COST_USD_PER_REVIEW } from "./budget";
import { runZoomReview } from "./zoom-review";
import { prewarmEvidenceSnippets } from "./snippet-cache";
import { findChecklistPages, mentionsChecklist } from "./find-checklist-pages";
import { buildDrawingIndex, formatDrawingIndex } from "./drawing-index";
import { verifyNumericCitations } from "./numeric-verification";
import {
  buildFindingsByText,
  partitionItemsForReuse,
  remapChecklistPages,
  remapItem,
  selectBestBaseline,
} from "./partial-reuse";
import {
  CHECKLIST_REVIEW_STEPS,
  type ChecklistReviewProgressEvent,
  type ChecklistReviewStreamEvent,
} from "./progress";
import { countFindingStatuses, type ChecklistFinding, type ChecklistReview } from "./types";

/**
 * 텍스트 추출로 얻은 체크리스트 항목이 이보다 적으면 "표 제목만 잡힌 오추출"로 판단합니다.
 * 체크리스트 표 본문이 이미지·외곽선 글자인 PDF는 텍스트 레이어에 제목 줄만 있어서
 * 항목 1~2개로 잘못 추출되는데, 0개가 아니라는 이유로 비전 추출 전환이 안 되면
 * 표 전체가 항목 1개로 평가되는 잘못된 결과가 나옵니다 (실사용 재현 사례).
 */
const MIN_PLAUSIBLE_CHECKLIST_ITEMS = 5;

/**
 * "담당자 직접 확인 필요" 플래그 — AI 판정 신뢰도가 낮은 항목을 표시해 사람이 볼
 * 우선순위를 좁혀줍니다. (AI는 참고, 최종 판단은 담당자라는 역할 분담을 UI로 구현)
 */
function applyReviewFlag(finding: ChecklistFinding, zoomAttemptedItemIds: Set<string>): ChecklistFinding {
  const zoomed = finding.zoomAttempted || zoomAttemptedItemIds.has(finding.itemId);
  if (finding.unevaluated) {
    return {
      ...finding,
      reviewFlag: "시간 한도로 이번 회차에 평가되지 않음 — 같은 자료로 재분석하면 이 항목만 재평가됩니다",
    };
  }
  if (finding.status === "확인불가") {
    return {
      ...finding,
      reviewFlag: zoomed
        ? "고해상도 확대 판독에도 근거를 찾지 못함 — 도서에서 직접 확인 필요"
        : "AI가 근거를 찾지 못한 항목 — 도서에서 직접 확인 필요",
    };
  }
  if (finding.status === "부분충족" && zoomed) {
    return {
      ...finding,
      reviewFlag: "고해상도 확대 판독 후에도 근거가 불완전 — 보완요구 전 직접 확인 권장",
    };
  }
  return finding;
}

/**
 * 선별 줌 실행 + 판정 교체 공통 로직. 확대 시도한 항목에는 zoomAttempted를 기록해
 * 다음 재분석에서 같은 항목을 반복 확대(반복 과금)하지 않습니다.
 * 반환: 교체 반영된 findings와 이번에 확대를 시도한 항목 id 집합.
 */
async function applyZoomRefinement(options: {
  files: UploadedFileSummary[];
  items: ChecklistReview["items"];
  findings: ChecklistFinding[];
  context: Awaited<ReturnType<typeof buildEvaluationContext>>;
  startedAt: number;
  remainingBudgetUsd: number;
  usageByModel: UsageByModel;
  drawingIndex?: import("./drawing-index").DrawingIndexEntry[];
}): Promise<{ findings: ChecklistFinding[]; attempted: Set<string>; refinedCount: number }> {
  const zoom = await runZoomReview({
    files: options.files,
    items: options.items,
    findings: options.findings,
    context: options.context,
    getRemainingBudgetMs: () => Math.max(0, 285_000 - (Date.now() - options.startedAt)),
    remainingBudgetUsd: options.remainingBudgetUsd,
    drawingIndex: options.drawingIndex,
  });
  if (!zoom) return { findings: options.findings, attempted: new Set(), refinedCount: 0 };

  mergeUsageByModel(options.usageByModel, zoom.usageByModel);
  const attempted = new Set(zoom.attemptedItemIds);
  const refinedById = new Map(zoom.findings.map((finding) => [finding.itemId, finding]));

  // 심화 판독은 판정을 "올리는"(충족 방향) 변경만 반영합니다. 확대본은 문서 일부(발췌
  // 페이지)만 담고 있어, 그 안에서 근거를 못 찾았다는 이유로 문서 전체를 보고 내린
  // 기존 판정을 강등하는 것은 오판입니다 (실사용에서 부분충족이 회차마다 확인불가로
  // 강등되며 확인불가가 6->16->24로 늘어난 사례 — 프롬프트 지시만으로는 모델이 지키지
  // 않아 코드로 강제).
  const STATUS_RANK: Record<ChecklistFinding["status"], number> = { 충족: 3, 부분충족: 2, 미충족: 1, 확인불가: 0 };

  let refinedCount = 0;
  let discardedDowngrades = 0;
  const merged = options.findings.map((finding) => {
    const refined = refinedById.get(finding.itemId);
    if (refined) {
      if (STATUS_RANK[refined.status] > STATUS_RANK[finding.status]) {
        refinedCount += 1;
        return { ...refined, zoomAttempted: true };
      }
      if (refined.status === finding.status) {
        // 판정 동일 — 확대 판독에서 얻은 근거·좌표(region)가 더 구체적이면 채택
        return { ...refined, zoomAttempted: true };
      }
      discardedDowngrades += 1;
      // 판정은 유지하되, 확대 판독이 짚은 근거 위치(region)만 수확해 같은 페이지의
      // 기존 근거에 부착 — 강등은 무효지만 "어디를 봤는지"는 유효한 정보.
      const refinedRegionByPage = new Map(
        refined.evidence
          .filter((entry) => entry.region)
          .map((entry) => [`${entry.fileName.normalize("NFC")}#${entry.page}`, entry.region!]),
      );
      const evidence = finding.evidence.map((entry) => {
        if (entry.region) return entry;
        const region = refinedRegionByPage.get(`${entry.fileName.normalize("NFC")}#${entry.page}`);
        return region ? { ...entry, region } : entry;
      });
      return { ...finding, evidence, zoomAttempted: true };
    }
    return attempted.has(finding.itemId) ? { ...finding, zoomAttempted: true } : finding;
  });
  if (discardedDowngrades > 0) {
    console.log(`[checklist-review] zoom 강등 판정 ${discardedDowngrades}건 폐기 (기존 판정 유지)`);
  }

  if (zoom.zoomedItems > 0) {
    console.log(`[checklist-review] zoom 판정 변경=${refinedCount}/${zoom.zoomedItems}`);
  }
  return { findings: merged, attempted, refinedCount };
}


export type RunChecklistReviewInput = {
  projectId: string;
  fileRefs: StoredFileRef[];
  files: File[];
  projectSnapshot: Project | null;
};

export type RunChecklistReviewResult = {
  review: ChecklistReview;
  project?: Project;
  warnings: string[];
};

type StreamEmitter = (event: ChecklistReviewStreamEvent) => void;

function emitStep(emit: StreamEmitter | undefined, step: ChecklistReviewProgressEvent["step"], label?: string) {
  const stepIndex = CHECKLIST_REVIEW_STEPS.findIndex((item) => item.id === step);
  const meta = CHECKLIST_REVIEW_STEPS[stepIndex];
  console.log(`[checklist-review] step=${step}${label ? ` label=${label}` : ""}`);
  emit?.({
    type: "progress",
    step,
    label: label ?? meta?.label ?? step,
    stepIndex: stepIndex + 1,
    stepCount: CHECKLIST_REVIEW_STEPS.length,
  });
}

/** 사전 검토자료의 체크리스트를 추출하고 항목별 충족 여부를 평가합니다. */
export async function runChecklistReview(
  input: RunChecklistReviewInput,
  emit?: StreamEmitter,
): Promise<RunChecklistReviewResult> {
  let newlySavedFiles: SavedUploadFile[] = [];
  const startedAt = Date.now();

  try {
    emitStep(emit, "validate");

    const { projectId, fileRefs, files, projectSnapshot } = input;
    if (!projectId) {
      throw new Error("프로젝트 ID가 필요합니다.");
    }
    if (fileRefs.length === 0 && files.length === 0) {
      throw new Error("검토할 자료를 선택해 주세요.");
    }
    if (!isClaudeConfigured()) {
      throw new Error("CLAUDE_API_KEY(또는 ANTHROPIC_API_KEY)가 설정되지 않았습니다.");
    }

    let project = await getProjectById(projectId);
    if (!project && projectSnapshot?.id === projectId) {
      project = await ensureProjectRecordFromSnapshot(projectSnapshot);
    }
    if (!project) {
      throw new Error("프로젝트를 찾을 수 없습니다. 페이지를 새로고침해 주세요.");
    }
    if (isProjectTrashed(project)) {
      throw new Error("휴지통에 있는 프로젝트는 검토할 수 없습니다.");
    }

    emitStep(emit, "upload");
    const uploadedFiles = files.length > 0 ? await saveUploadedFiles(projectId, files) : [];
    newlySavedFiles = uploadedFiles;
    const savedFiles = [...storedRefsToSavedFiles(fileRefs), ...uploadedFiles];

    const reviewedAt = new Date().toISOString();
    const persistedFileIds = new Set<string>();
    const persistedFiles = [
      ...storedRefsToProjectFiles(fileRefs, reviewedAt),
      ...toProjectFiles(uploadedFiles, reviewedAt),
    ].filter((file) => {
      if (persistedFileIds.has(file.id)) return false;
      persistedFileIds.add(file.id);
      return true;
    });

    emitStep(emit, "extract");
    const { extractDocumentContent } = await import("@/lib/document-content");
    const extractionWarnings: string[] = [];
    // 원본 버퍼 보관 — 검토 저장 후 근거 캡처를 "추가 다운로드 없이" 미리 생성하는 데 사용.
    // (과거 캡처 조회 시마다 원본을 재다운로드해 전송량 한도를 초과한 사고의 구조적 방지)
    const fileBuffers = new Map<string, Buffer>();
    const filesForAnalysis: UploadedFileSummary[] = await Promise.all(
      savedFiles.map(async (file) => {
        const buffer = await readSavedUploadFile(file);
        if (file.originalName.toLowerCase().endsWith(".pdf")) fileBuffers.set(file.id, buffer);
        const content = await extractDocumentContent(buffer, file.originalName);
        extractionWarnings.push(...content.warnings);
        const pdfAsset = content.visionAssets?.find((asset) => asset.mediaType === "application/pdf");
        return {
          id: file.id,
          originalName: file.originalName,
          fileType: file.fileType,
          sizeBytes: file.sizeBytes,
          extractedTextPreview: content.fullText,
          visionAssets: content.visionAssets,
          totalPages: content.totalPages,
          contentHash: hashFileBuffer(buffer),
          pageHashes: pdfAsset ? (await hashPdfPages(pdfAsset.base64)) ?? undefined : undefined,
        };
      }),
    );

    // 이 프로젝트의 가장 최근 검토를 "기준"으로 삼아 이번 파일들과 페이지 "내용"(해시)을
    // 기준으로 정렬합니다. 단순 페이지 번호 비교가 아니라 LCS(최장 공통 부분수열) 정렬을
    // 쓰므로, 페이지가 삽입·삭제돼 번호가 밀려도 같은 내용의 페이지를 올바르게 대응시켜
    // "실제로는 안 바뀐 페이지"를 찾아냅니다.
    // - 파일 전체가 완전히 같으면(내용 해시 일치) 정렬 계산 없이 항등 매핑.
    // - 기준이 없거나(첫 검토) 정렬 비용이 너무 크면(대용량) 비교를 포기 — 안전하게 전체
    //   재분석으로 처리됩니다.
    // 이후 이 정보로 "근거 페이지가 현재 문서에 그대로 있는 항목은 재사용(페이지 번호는
    // 현재 문서 기준으로 재매핑), 없어졌거나 바뀐 항목만 재분석"을 수행해 Claude 호출(=비용)을
    // 최소화합니다.
    // 기준 검토 선택: 직전 1건이 아니라 전체 이력에서 현재 제출물과 가장 잘 맞는 검토를
    // 찾습니다. "초안 -> 개선안 -> 다시 초안"처럼 과거에 분석했던 파일이 다시 올라와도
    // 그때의 결과를 찾아 재사용하기 위함입니다 (한 번 분석한 데이터는 이력에 보관돼 있으므로
    // 새로 올라온 제출물을 이력 전체와 비교해 중복 여부를 판단).
    const currentFingerprints = filesForAnalysis.map((file) => ({
      originalName: file.originalName,
      contentHash: file.contentHash,
      pageHashes: file.pageHashes,
    }));
    const baselineCandidate = selectBestBaseline(currentFingerprints, project.checklistReviews ?? []);
    const baselineReview = baselineCandidate?.review;
    const alignments = baselineCandidate?.alignments ?? null;
    // 제출물에 변경이 하나라도 있으면(파일 추가/제거·페이지 추가/삭제/수정) true.
    // 이 경우 비충족 판정은 — 보완 내용이 새/다른 페이지에 반영됐을 수 있으므로 —
    // 근거 페이지가 그대로여도 재사용하지 않고 재분석합니다(partitionItemsForReuse 참고).
    const documentChanged = baselineCandidate ? !baselineCandidate.exactMatch : true;
    const baselineFindingsByText = baselineReview
      ? buildFindingsByText(baselineReview.items, baselineReview.findings)
      : null;
    const remappedBaselineChecklistPages =
      baselineReview && alignments && baselineReview.checklistPages.length > 0
        ? remapChecklistPages(baselineReview.checklistPages, alignments)
        : null;
    // 진단: 체크리스트 페이지 재사용이 실패하면 어떤 항목이 왜 실패했는지 남깁니다
    // (파일명 불일치인지, 페이지 대응 실패인지 구분 가능하도록 정렬 키 목록도 함께).
    if (baselineReview && alignments && remappedBaselineChecklistPages === null) {
      console.log(
        `[checklist-review] checklistPages-remap-failed baselinePages=${JSON.stringify(baselineReview.checklistPages)} ` +
          `alignKeys=${JSON.stringify([...alignments.byFile.keys()])}`,
      );
    }

    console.log(
      alignments
        ? `[checklist-review] baseline=${baselineReview!.id} changed=${documentChanged} checklistPagesReusable=${remappedBaselineChecklistPages !== null} ` +
            `align=[${[...alignments.byFile.entries()]
              .map(([name, entry]) => {
                const renamed = entry.currentFileName !== name ? `->${entry.currentFileName}` : "";
                return `${name}${renamed}:${entry.kind === "identical" ? "동일" : `${entry.baselineToCurrent.size}p대응확인`}`;
              })
              .join(", ")}] moved=${alignments.movedPages.size}p`
        : `[checklist-review] baseline=없음 (첫 검토이거나 대응되는 이력 없음)`,
    );

    // 법령·공간정보 조회는 Claude 호출이 아니라 비용이 들지 않고, 시간에 따라 최신화될 수
    // 있으므로 항상 새로 조회합니다.
    emitStep(emit, "context");
    const context = await buildEvaluationContext(projectId);

    let items: ChecklistReview["items"];
    let itemSource: ChecklistReview["itemSource"];
    let checklistPages: ChecklistReview["checklistPages"];
    let findings: ChecklistReview["findings"];
    let summary: string;
    let model: string;
    let metrics: ChecklistReview["metrics"];
    const usageByModel: UsageByModel = new Map();
    let evaluationWarnings: string[];

    // 도면 인덱스(표제란 기반) — 평가 프롬프트의 [도면 목차]와 심화 판독 페이지 선정에
    // 사용. 텍스트 레이어만 쓰므로 비용 없음.
    const drawingIndex = buildDrawingIndex(filesForAnalysis);
    if (drawingIndex.length > 0) {
      console.log(
        `[checklist-review] drawing-index pages=${drawingIndex.length} ` +
          drawingIndex.slice(0, 12).map((entry) => `p.${entry.page}:${entry.types.join("·")}`).join(" "),
      );
    }

    if (
      remappedBaselineChecklistPages &&
      baselineReview &&
      alignments &&
      baselineReview.items.length >= MIN_PLAUSIBLE_CHECKLIST_ITEMS
    ) {
      // 체크리스트 표가 있던 페이지들이 (번호가 밀렸더라도) 현재 문서에 그대로 있으므로
      // 항목 추출은 다시 하지 않고 기준 검토의 항목 목록을 현재 페이지 번호로 재매핑해
      // 그대로 씁니다 (항목별 재사용 여부는 아래에서 개별 판정).
      emitStep(emit, "checklist", "체크리스트 페이지 확인됨 — 이전 항목 목록 재사용 중");
      items = baselineReview.items.map((item) => remapItem(item, alignments));
      itemSource = baselineReview.itemSource;
      checklistPages = remappedBaselineChecklistPages;
    } else {
      emitStep(emit, "checklist");
      const checklistSlices = findChecklistPages(filesForAnalysis);
      console.log(
        `[checklist-review] files=${filesForAnalysis.length} checklistPages=${checklistSlices.length} ` +
          filesForAnalysis
            .map((file) => `${file.originalName}:${file.totalPages ?? "?"}p/text${(file.extractedTextPreview ?? "").length}자`)
            .join(", "),
      );

      // 사전 차단: 텍스트가 충분히 추출되는 문서인데 '체크리스트' 언급이 전혀 없으면
      // 경관 체크리스트가 없는 문서(오업로드)로 판단하고, 비싼 비전 추출·평가로 넘어가기
      // 전에 명확히 안내하며 중단합니다. 텍스트가 빈약한 문서(스캔본·이미지 표)는
      // 텍스트만으로 단정할 수 없으므로 기존대로 비전 경로를 허용합니다.
      if (checklistSlices.length === 0) {
        const totalChars = filesForAnalysis.reduce(
          (sum, file) => sum + (file.extractedTextPreview ?? "").length,
          0,
        );
        const totalPages = filesForAnalysis.reduce((sum, file) => sum + (file.totalPages ?? 0), 0);
        const richTextLayer = totalChars >= 20_000 || (totalPages > 0 && totalChars / totalPages >= 300);
        const mentioned = filesForAnalysis.some((file) => mentionsChecklist(file.extractedTextPreview ?? ""));
        if (richTextLayer && !mentioned) {
          console.warn(
            `[checklist-review] 사전 차단 — 텍스트 ${totalChars}자/${totalPages}p 추출됐으나 체크리스트 언급 없음`,
          );
          throw new Error(
            "업로드한 문서에서 경관·공공디자인 체크리스트를 찾지 못했습니다. " +
              "체크리스트 페이지가 포함된 심의도서(사전검토 체크리스트 양식 포함)인지 확인한 뒤 다시 업로드해 주세요.",
          );
        }
      }

      let extractedItems: ChecklistReview["items"] = [];
      if (checklistSlices.length > 0) {
        emitStep(emit, "checklist", `체크리스트 페이지 ${checklistSlices.length}개에서 항목 추출 중`);
        const extracted = await extractChecklistItems(checklistSlices);
        extractedItems = extracted.items;
        addUsage(usageByModel, extracted.model, extracted.usage);
      }
      if (extractedItems.length > 0 && extractedItems.length < MIN_PLAUSIBLE_CHECKLIST_ITEMS) {
        console.warn(
          `[checklist-review] 텍스트 추출 항목이 ${extractedItems.length}개뿐 — 체크리스트 표 본문이 ` +
            `텍스트 레이어에 없는 문서(제목만 추출됨)로 판단해 비전 추출로 전환`,
        );
        extractedItems = [];
      }
      items = extractedItems;
      // 텍스트 레이어에서 항목을 얻지 못함 → 평가 단계에서 비전으로 추출+평가. 이 경로는
      // 항목을 미리 알 수 없어(비전이 문서를 보면서 한 번에 찾고 판정) 아래의 항목별 재사용을
      // 적용할 수 없고, 매번 전체를 새로 평가합니다.
      itemSource = extractedItems.length === 0 ? "vision" : "text";
      checklistPages = checklistSlices.map((slice) => ({ fileName: slice.fileName, page: slice.page }));
    }

    const { reused: reusedFindings, needEval: itemsNeedingEval, skipReasons } =
      items.length > 0 && baselineFindingsByText && alignments
        ? partitionItemsForReuse(items, baselineFindingsByText, alignments, documentChanged)
        : { reused: new Map<string, ChecklistFinding>(), needEval: items, skipReasons: new Map() };

    // 진단: 기준 검토가 있는데 재사용이 0건이면 사유별 집계를 남깁니다 — "동일 문서인데
    // 왜 토큰을 썼는지"를 로그만으로 특정할 수 있게 합니다.
    if (baselineReview && items.length > 0) {
      const reasonCounts = new Map<string, number>();
      for (const reason of skipReasons.values()) {
        reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
      }
      console.log(
        `[checklist-review] reuse-partition reused=${reusedFindings.size} needEval=${itemsNeedingEval.length} ` +
          `changed=${documentChanged} reasons=${JSON.stringify(Object.fromEntries(reasonCounts))}`,
      );
    }

    if (items.length > 0 && itemsNeedingEval.length === 0) {
      // 모든 항목의 근거 페이지가 변경되지 않아 전부 재사용 — AI 재호출 없음.
      emitStep(emit, "evaluate", "동일 근거 페이지 확인 — 이전 분석 결과 재사용 중 (AI 재호출 없음)");
      let reusedList = items.map((item) => reusedFindings.get(item.id)!);
      evaluationWarnings = [
        `이전 검토(${baselineReview!.reviewedAt.slice(0, 16).replace("T", " ")} UTC)와 비교해 변경된 근거 페이지가 없어, AI를 다시 호출하지 않고 그 결과를 재사용했습니다.`,
      ];

      // 심화 판독: 대형 문서는 첫 분석에서 시간이 모자라 선별 줌이 생략되는데, 동일 문서
      // 재분석은 재사용으로 수 초 만에 끝나 시간·예산이 통째로 남는다 — 이때 아직 확대
      // 판독을 시도하지 않은 미해결(확인불가·부분충족) 항목을 고해상도로 재판독한다.
      // (이미 시도한 항목은 zoomAttempted로 건너뛰어 반복 과금 없음)
      try {
        const zoomResult = await applyZoomRefinement({
          files: filesForAnalysis,
          items,
          findings: reusedList,
          context,
          drawingIndex,
          startedAt,
          remainingBudgetUsd: Math.max(0, MAX_COST_USD_PER_REVIEW - estimateUsageSummary(usageByModel).costUsd),
          usageByModel,
        });
        reusedList = zoomResult.findings;
        if (zoomResult.attempted.size > 0) {
          emitStep(emit, "evaluate", `미해결 ${zoomResult.attempted.size}개 항목을 고해상도로 심화 판독했습니다`);
          evaluationWarnings.push(
            `이전 검토에서 판독이 불충분했던 ${zoomResult.attempted.size}개 항목을 고해상도 확대로 재판독했습니다` +
              (zoomResult.refinedCount > 0 ? ` (판정 변경 ${zoomResult.refinedCount}건).` : "."),
          );
        }
      } catch (error) {
        console.warn(
          "[checklist-review] 심화 판독 실패 — 재사용 판정 유지:",
          error instanceof Error ? error.message : error,
        );
      }

      findings = reusedList.map((finding) => applyReviewFlag(finding, new Set()));
      summary = baselineReview!.summary;
      model = baselineReview!.model;
      metrics = baselineReview!.metrics;
    } else {
      const reuseNotice =
        reusedFindings.size > 0
          ? [
              `이전 검토에서 충족으로 판정됐고 근거 페이지가 변경되지 않은 ${reusedFindings.size}개 항목은 재사용하고, ` +
                `나머지 ${itemsNeedingEval.length}개 항목(미충족·부분충족·확인불가 및 근거가 변경된 항목)은 ` +
                `보완 내용 반영 여부를 확인하기 위해 다시 분석했습니다.`,
            ]
          : [];

      // 사업 규모 지표 추출은 평가와 병렬로 진행 (실패해도 검토에 영향 없음)
      const metricsPromise = extractProjectMetrics(filesForAnalysis);

      emitStep(emit, "evaluate");
      const remainingBudgetUsd = () =>
        Math.max(0, MAX_COST_USD_PER_REVIEW - estimateUsageSummary(usageByModel).costUsd);

      const evaluation = await evaluateChecklistItems({
        files: filesForAnalysis,
        items: itemsNeedingEval,
        checklistPages,
        context,
        drawingIndexText: formatDrawingIndex(drawingIndex),
        getRemainingBudgetMs: () => Math.max(0, 285_000 - (Date.now() - startedAt)),
        getRemainingBudgetUsd: remainingBudgetUsd,
        onProgress: (label) => emitStep(emit, "evaluate", label),
      });

      mergeUsageByModel(usageByModel, evaluation.usageByModel);
      const evidenceCount = evaluation.findings.reduce((sum, finding) => sum + finding.evidence.length, 0);
      const regionCount = evaluation.findings.reduce(
        (sum, finding) => sum + finding.evidence.filter((entry) => entry.region).length,
        0,
      );
      console.log(
        `[checklist-review] items=${evaluation.items.length} findings=${evaluation.findings.length} evidence=${evidenceCount} regions=${regionCount} vision=${evaluation.usedVision} model=${evaluation.model} reused=${reusedFindings.size}`,
      );

      // itemSource가 "vision"이면 항목을 미리 몰랐으므로(위에서 items=[]로 시작) 비전이
      // 새로 발견·평가한 결과를 그대로 씁니다.
      if (itemSource === "vision") {
        items = evaluation.items;
        checklistPages = evaluation.checklistPages;
      }

      if (items.length === 0) {
        throw new Error(
          dedupeWarnings([...evaluation.warnings]).join(" ") ||
            "제출 문서에서 '체크리스트' 페이지를 찾지 못했습니다. 체크리스트가 포함된 자료인지 확인해 주세요.",
        );
      }

      // 선별 줌: 이번에 새로 평가한 항목 중 판독 불충분(확인불가·부분충족) 항목의 근거
      // 페이지를 고해상도 타일로 재판독. 남은 예산·시간 안에서만 실행됩니다.
      let evaluationFindings = evaluation.findings;
      let zoomAttemptedItemIds = new Set<string>();
      try {
        const zoomResult = await applyZoomRefinement({
          files: filesForAnalysis,
          items: itemsNeedingEval,
          findings: evaluationFindings,
          context,
          drawingIndex,
          startedAt,
          remainingBudgetUsd: remainingBudgetUsd(),
          usageByModel,
        });
        evaluationFindings = zoomResult.findings;
        zoomAttemptedItemIds = zoomResult.attempted;
      } catch (error) {
        console.warn(
          "[checklist-review] 선별 줌 실패 — 1차 판정 유지:",
          error instanceof Error ? error.message : error,
        );
      }

      const freshFindingsById = new Map(evaluationFindings.map((finding) => [finding.itemId, finding]));
      findings = items
        .map((item) => reusedFindings.get(item.id) ?? freshFindingsById.get(item.id))
        .filter((finding): finding is ChecklistFinding => Boolean(finding))
        .map((finding) => applyReviewFlag(finding, zoomAttemptedItemIds));
      summary = evaluation.summary || baselineReview?.summary || "";
      model = evaluation.model || baselineReview?.model || "";
      const metricsResult = await metricsPromise;
      metrics = metricsResult.metrics;
      mergeUsageByModel(usageByModel, metricsResult.usageByModel);
      evaluationWarnings = [...reuseNotice, ...evaluation.warnings];
    }

    // 수치 인용 검증 — 인용된 치수·수치가 해당 페이지 원문 텍스트에 실제로 있는지
    // 대조하고, 없으면 "확인 필요" 플래그를 단다 (판정은 바꾸지 않음 — 오류 최소화).
    const numericCheck = verifyNumericCitations(findings, filesForAnalysis);
    if (numericCheck.checked > 0) {
      console.log(
        `[checklist-review] numeric-verify checked=${numericCheck.checked} flagged=${numericCheck.flagged}`,
      );
    }

    // 진단: 이번 검토에 근거 위치 좌표(마커)가 몇 개, 어느 항목·페이지에 잡혔는지
    const regionRefs = findings.flatMap((finding) =>
      finding.evidence.filter((entry) => entry.region).map((entry) => `${finding.itemId}:p.${entry.page}`),
    );
    console.log(
      `[checklist-review] regions saved=${regionRefs.length}${regionRefs.length > 0 ? ` examples=[${regionRefs.slice(0, 8).join(", ")}]` : ""}`,
    );

    const usageSummary = estimateUsageSummary(usageByModel);
    console.log(
      `[checklist-review] cost-summary totalTokens=${usageSummary.totalTokens} costUsd=${usageSummary.costUsd.toFixed(4)}`,
    );

    const review: ChecklistReview = {
      id: `review-${Date.now()}-${crypto.randomUUID()}`,
      reviewedAt,
      files: savedFiles.map((file) => {
        const analyzed = filesForAnalysis.find((entry) => entry.id === file.id);
        return {
          id: file.id,
          originalName: file.originalName,
          fileType: file.originalName.split(".").pop()?.toUpperCase() ?? file.fileType,
          sizeBytes: file.sizeBytes,
          storageKey: file.storageKey,
          blobUrl: file.blobUrl,
          contentHash: analyzed?.contentHash,
          pageHashes: analyzed?.pageHashes,
        };
      }),
      checklistPages,
      items,
      findings,
      counts: countFindingStatuses(findings),
      drawingIndex: drawingIndex
        .slice(0, 200)
        .map((entry) => ({ page: entry.page, types: entry.types, scale: entry.scale })),
      metrics,
      summary,
      referenceLaws: context.referenceLaws.slice(0, 12).map((law) => ({
        title: law.title,
        article: law.article,
        summary: law.summary,
        sourceUrl: law.sourceUrl,
      })),
      spatialContext: context.spatial,
      lawSource: context.lawSource,
      itemSource,
      model,
      usage: usageSummary,
      warnings: dedupeWarnings([...context.warnings, ...extractionWarnings, ...evaluationWarnings]),
    };

    emitStep(emit, "save");
    const updatedProject =
      (await addProjectChecklistReview(projectId, review, persistedFiles)) ??
      (await upsertProjectRecord({
        ...project,
        files: [...project.files, ...persistedFiles],
        checklistReviews: [...(project.checklistReviews ?? []), review],
      }));

    newlySavedFiles = [];

    // 근거 캡처 선생성 — 분석에 쓴 버퍼 그대로 사용(원본 재다운로드 0회). 남은 서버
    // 시간 안에서 화면 표시 순서대로 생성하며, 실패해도 검토 결과에는 영향 없음.
    emitStep(emit, "save");
    try {
      for (const file of savedFiles) {
        const bytes = fileBuffers.get(file.id);
        if (!bytes) continue;
        await prewarmEvidenceSnippets({
          projectId,
          fileId: file.id,
          pdfBytes: bytes,
          findings,
          getRemainingBudgetMs: () => Math.max(0, 285_000 - (Date.now() - startedAt)),
        });
      }
    } catch (error) {
      console.warn(
        "[checklist-review] 캡처 선생성 건너뜀:",
        error instanceof Error ? error.message : error,
      );
    } finally {
      fileBuffers.clear();
    }

    return { review, project: updatedProject, warnings: review.warnings };
  } catch (error) {
    if (newlySavedFiles.length > 0) {
      await deleteSavedUploadFiles(newlySavedFiles);
    }

    if (isAiAnalysisError(error)) {
      throw new Error(`AI 검토를 완료하지 못했습니다. ${error.message}`);
    }

    throw error;
  }
}
