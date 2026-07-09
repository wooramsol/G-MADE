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
        const content = await extractDocumentContent(await readSavedUploadFile(file), file.originalName);
        extractionWarnings.push(...content.warnings);
        return {
          id: file.id,
          originalName: file.originalName,
          fileType: file.fileType,
          sizeBytes: file.sizeBytes,
          extractedTextPreview: content.fullText,
          visionAssets: content.visionAssets,
          totalPages: content.totalPages,
        };
      }),
    );

    emitStep(emit, "checklist");
    const checklistSlices = findChecklistPages(filesForAnalysis);
    console.log(
      `[checklist-review] files=${filesForAnalysis.length} checklistPages=${checklistSlices.length} ` +
        filesForAnalysis
          .map((file) => `${file.originalName}:${file.totalPages ?? "?"}p/text${(file.extractedTextPreview ?? "").length}자`)
          .join(", "),
    );
    let items: ChecklistReview["items"] = [];
    let itemSource: ChecklistReview["itemSource"] = "text";

    if (checklistSlices.length > 0) {
      emitStep(emit, "checklist", `체크리스트 페이지 ${checklistSlices.length}개에서 항목 추출 중`);
      const extracted = await extractChecklistItems(checklistSlices);
      items = extracted.items;
    }

    if (items.length === 0) {
      // 텍스트 레이어에서 항목을 얻지 못함 → 평가 단계에서 비전으로 추출+평가
      itemSource = "vision";
    }

    emitStep(emit, "context");
    const context = await buildEvaluationContext(projectId);

    emitStep(emit, "evaluate");
    const evaluation = await evaluateChecklistItems({
      files: filesForAnalysis,
      items,
      checklistPages: checklistSlices.map((slice) => ({ fileName: slice.fileName, page: slice.page })),
      context,
      getRemainingBudgetMs: () => Math.max(0, 285_000 - (Date.now() - startedAt)),
      onProgress: (label) => emitStep(emit, "evaluate", label),
    });

    console.log(
      `[checklist-review] items=${evaluation.items.length} findings=${evaluation.findings.length} vision=${evaluation.usedVision} model=${evaluation.model}`,
    );
    if (evaluation.items.length === 0) {
      throw new Error(
        dedupeWarnings([...evaluation.warnings]).join(" ") ||
          "제출 문서에서 '체크리스트' 페이지를 찾지 못했습니다. 체크리스트가 포함된 자료인지 확인해 주세요.",
      );
    }

    const review: ChecklistReview = {
      id: `review-${Date.now()}-${crypto.randomUUID()}`,
      reviewedAt,
      files: savedFiles.map((file) => ({
        id: file.id,
        originalName: file.originalName,
        fileType: file.originalName.split(".").pop()?.toUpperCase() ?? file.fileType,
        sizeBytes: file.sizeBytes,
        storageKey: file.storageKey,
        blobUrl: file.blobUrl,
      })),
      checklistPages: evaluation.checklistPages,
      items: evaluation.items,
      findings: evaluation.findings,
      counts: countFindingStatuses(evaluation.findings),
      summary: evaluation.summary,
      referenceLaws: context.referenceLaws.slice(0, 12).map((law) => ({
        title: law.title,
        article: law.article,
        summary: law.summary,
        sourceUrl: law.sourceUrl,
      })),
      spatialContext: context.spatial,
      lawSource: context.lawSource,
      itemSource,
      model: evaluation.model,
      warnings: dedupeWarnings([...context.warnings, ...extractionWarnings, ...evaluation.warnings]),
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
