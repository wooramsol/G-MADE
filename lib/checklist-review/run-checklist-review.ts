import { dedupeWarnings } from "@/lib/analysis-warnings";
import { isAiAnalysisError } from "@/lib/ai/analysis-error";
import type { UploadedFileSummary } from "@/lib/ai/uploaded-file";
import { buildEvaluationContext } from "@/lib/evaluation-context";
import { ensureProjectRecordFromSnapshot } from "@/lib/ensure-project-record";
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
import { computeFilesFingerprint, hashFileBuffer } from "./file-fingerprint";
import { findChecklistPages } from "./find-checklist-pages";
import {
  CHECKLIST_REVIEW_STEPS,
  type ChecklistReviewProgressEvent,
  type ChecklistReviewStreamEvent,
} from "./progress";
import { countFindingStatuses, type ChecklistReview } from "./types";

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
    const filesForAnalysis: UploadedFileSummary[] = await Promise.all(
      savedFiles.map(async (file) => {
        const buffer = await readSavedUploadFile(file);
        const content = await extractDocumentContent(buffer, file.originalName);
        extractionWarnings.push(...content.warnings);
        return {
          id: file.id,
          originalName: file.originalName,
          fileType: file.fileType,
          sizeBytes: file.sizeBytes,
          extractedTextPreview: content.fullText,
          visionAssets: content.visionAssets,
          totalPages: content.totalPages,
          contentHash: hashFileBuffer(buffer),
        };
      }),
    );

    // 동일한 파일 집합(내용 기준)을 이 프로젝트에서 이미 분석한 적이 있는지 확인합니다.
    // 완전히 같은 문서라면 체크리스트 추출·항목 평가·규모 지표 추출(모두 Claude 호출)을
    // 다시 하지 않고 이전 결과를 그대로 재사용해 토큰을 아낍니다. 파일 하나라도 이름·내용이
    // 다르면(계산해시 불일치) 캐시를 사용하지 않고 항상 새로 분석합니다.
    const currentFingerprint = computeFilesFingerprint(
      filesForAnalysis.map((file) => ({ originalName: file.originalName, contentHash: file.contentHash })),
    );
    const cachedReview = currentFingerprint
      ? [...(project.checklistReviews ?? [])]
          .reverse()
          .find((entry) => computeFilesFingerprint(entry.files) === currentFingerprint)
      : undefined;
    console.log(
      cachedReview
        ? `[checklist-review] cache-hit fingerprint=${currentFingerprint} reusedReviewId=${cachedReview.id} reusedAt=${cachedReview.reviewedAt}`
        : `[checklist-review] cache-miss fingerprint=${currentFingerprint ?? "null(해시 비교 불가)"}`,
    );

    // 법령·공간정보 조회는 Claude 호출이 아니라 비용이 들지 않고, 시간에 따라 최신화될 수
    // 있으므로 캐시 여부와 무관하게 항상 새로 조회합니다.
    emitStep(emit, "context");
    const context = await buildEvaluationContext(projectId);

    let items: ChecklistReview["items"];
    let itemSource: ChecklistReview["itemSource"];
    let checklistPages: ChecklistReview["checklistPages"];
    let findings: ChecklistReview["findings"];
    let summary: string;
    let model: string;
    let metrics: ChecklistReview["metrics"];
    let evaluationWarnings: string[];

    if (cachedReview) {
      emitStep(emit, "checklist", "동일 문서 감지 — 이전 분석 결과 재사용 중");
      emitStep(emit, "evaluate", "동일 문서 감지 — 이전 분석 결과 재사용 중 (AI 재호출 없음)");

      items = cachedReview.items;
      itemSource = cachedReview.itemSource;
      checklistPages = cachedReview.checklistPages;
      findings = cachedReview.findings;
      summary = cachedReview.summary;
      model = cachedReview.model;
      metrics = cachedReview.metrics;
      evaluationWarnings = [
        `동일한 문서(내용 기준)가 이전 검토(${cachedReview.reviewedAt.slice(0, 16).replace("T", " ")} UTC)에서 이미 분석되어, AI를 다시 호출하지 않고 그 결과를 재사용했습니다.`,
      ];
    } else {
      emitStep(emit, "checklist");
      const checklistSlices = findChecklistPages(filesForAnalysis);
      console.log(
        `[checklist-review] files=${filesForAnalysis.length} checklistPages=${checklistSlices.length} ` +
          filesForAnalysis
            .map((file) => `${file.originalName}:${file.totalPages ?? "?"}p/text${(file.extractedTextPreview ?? "").length}자`)
            .join(", "),
      );

      let extractedItems: ChecklistReview["items"] = [];
      if (checklistSlices.length > 0) {
        emitStep(emit, "checklist", `체크리스트 페이지 ${checklistSlices.length}개에서 항목 추출 중`);
        const extracted = await extractChecklistItems(checklistSlices);
        extractedItems = extracted.items;
      }
      // 텍스트 레이어에서 항목을 얻지 못함 → 평가 단계에서 비전으로 추출+평가
      const resolvedItemSource: ChecklistReview["itemSource"] = extractedItems.length === 0 ? "vision" : "text";

      // 사업 규모 지표 추출은 평가와 병렬로 진행 (실패해도 검토에 영향 없음)
      const metricsPromise = extractProjectMetrics(filesForAnalysis);

      emitStep(emit, "evaluate");
      const evaluation = await evaluateChecklistItems({
        files: filesForAnalysis,
        items: extractedItems,
        checklistPages: checklistSlices.map((slice) => ({ fileName: slice.fileName, page: slice.page })),
        context,
        getRemainingBudgetMs: () => Math.max(0, 285_000 - (Date.now() - startedAt)),
        onProgress: (label) => emitStep(emit, "evaluate", label),
      });

      const evidenceCount = evaluation.findings.reduce((sum, finding) => sum + finding.evidence.length, 0);
      const regionCount = evaluation.findings.reduce(
        (sum, finding) => sum + finding.evidence.filter((entry) => entry.region).length,
        0,
      );
      console.log(
        `[checklist-review] items=${evaluation.items.length} findings=${evaluation.findings.length} evidence=${evidenceCount} regions=${regionCount} vision=${evaluation.usedVision} model=${evaluation.model}`,
      );
      if (evaluation.items.length === 0) {
        throw new Error(
          dedupeWarnings([...evaluation.warnings]).join(" ") ||
            "제출 문서에서 '체크리스트' 페이지를 찾지 못했습니다. 체크리스트가 포함된 자료인지 확인해 주세요.",
        );
      }

      items = evaluation.items;
      itemSource = resolvedItemSource;
      checklistPages = evaluation.checklistPages;
      findings = evaluation.findings;
      summary = evaluation.summary;
      model = evaluation.model;
      metrics = await metricsPromise;
      evaluationWarnings = evaluation.warnings;
    }

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
        };
      }),
      checklistPages,
      items,
      findings,
      counts: countFindingStatuses(findings),
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
