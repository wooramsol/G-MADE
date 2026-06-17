import { mergeRoundAnalysisWarnings } from "@/lib/analysis-warnings";
import { buildEvaluationContext } from "@/lib/evaluation-context";
import {
  EVALUATION_ANALYSIS_STEPS,
  type EvaluationAnalysisProgressEvent,
} from "@/lib/evaluation-analysis-progress";
import {
  requiresAiUploadMaterials,
  requiresExpertUploadMaterials,
  validateEvaluationWeights,
} from "@/lib/evaluation-weight-requirements";
import { addProjectEvaluationRound, getProjectById, upsertProjectRecord } from "@/lib/project-store";
import { ensureProjectRecordFromSnapshot } from "@/lib/ensure-project-record";
import { createSkippedUploadAnalysis } from "@/lib/skipped-upload-analysis";
import {
  deleteSavedUploadFiles,
  readSavedUploadFile,
  saveUploadedFiles,
  storedRefsToProjectFiles,
  storedRefsToSavedFiles,
  toProjectFiles,
} from "@/lib/save-uploaded-files";
import type { StoredFileRef } from "@/lib/stored-file-ref";
import type { EvaluationItem, EvaluationRound, HumanEvaluationItemScore, Project } from "@/lib/types";
import { analyzeUploadedFiles } from "@/lib/upload-analysis";
import { applyFilesTextBudget } from "@/lib/ai/document-text-budget";
import type { AiProviderPreference } from "@/lib/ai/types";
import type { SavedUploadFile } from "@/lib/save-uploaded-files";

export type RunEvaluationRoundInput = {
  projectId: string;
  providerPreference: AiProviderPreference;
  reviewerName: string;
  expertSummary: string;
  aiWeight: number;
  expertWeight: number;
  evaluationItems: EvaluationItem[];
  manualExpertScores: HumanEvaluationItemScore[];
  aiFileRefs: StoredFileRef[];
  expertFileRefs: StoredFileRef[];
  aiFiles: File[];
  expertFiles: File[];
  projectSnapshot: Project | null;
};

export type RunEvaluationRoundResult = {
  round: EvaluationRound;
  project?: Project;
  analysisMode: EvaluationRound["aiAnalysis"]["mode"];
  warnings: string[];
};

type ProgressEmitter = (event: EvaluationAnalysisProgressEvent) => void;

function emitStep(emit: ProgressEmitter | undefined, step: EvaluationAnalysisProgressEvent["step"]) {
  const stepIndex = EVALUATION_ANALYSIS_STEPS.findIndex((item) => item.id === step);
  const meta = EVALUATION_ANALYSIS_STEPS[stepIndex];
  emit?.({
    type: "progress",
    step,
    label: meta?.label ?? step,
    stepIndex: stepIndex + 1,
    stepCount: EVALUATION_ANALYSIS_STEPS.length,
  });
}

export async function runEvaluationRound(
  input: RunEvaluationRoundInput,
  emit?: ProgressEmitter,
): Promise<RunEvaluationRoundResult> {
  let newlySavedFiles: SavedUploadFile[] = [];

  try {
    emitStep(emit, "validate");

    const {
      projectId,
      providerPreference,
      reviewerName,
      expertSummary,
      aiWeight,
      expertWeight,
      evaluationItems,
      manualExpertScores,
      aiFileRefs,
      expertFileRefs,
      aiFiles,
      expertFiles,
      projectSnapshot,
    } = input;

    if (!projectId) {
      throw new Error("프로젝트 ID가 필요합니다.");
    }

    let project = await getProjectById(projectId);
    if (!project && projectSnapshot?.id === projectId) {
      project = await ensureProjectRecordFromSnapshot(projectSnapshot);
    }

    if (!project) {
      throw new Error("프로젝트를 찾을 수 없습니다. 프로젝트를 다시 등록하거나 페이지를 새로고침해 주세요.");
    }

    if (evaluationItems.length === 0) {
      throw new Error("평가항목을 1개 이상 등록해 주세요.");
    }

    const normalizedAiWeight = Number.isFinite(aiWeight) ? aiWeight : 30;
    const normalizedExpertWeight = Number.isFinite(expertWeight) ? expertWeight : 100 - normalizedAiWeight;
    const weightError = validateEvaluationWeights(normalizedAiWeight, normalizedExpertWeight);
    if (weightError) {
      throw new Error(weightError);
    }

    const needsAiMaterials = requiresAiUploadMaterials(normalizedAiWeight);
    const needsExpertMaterials = requiresExpertUploadMaterials(normalizedExpertWeight);
    const hasAiMaterials = aiFileRefs.length > 0 || aiFiles.length > 0;
    const hasExpertMaterials = expertFileRefs.length > 0 || expertFiles.length > 0;

    if (needsAiMaterials && !hasAiMaterials) {
      throw new Error("AI 평가 자료를 선택해 주세요.");
    }

    if (needsExpertMaterials && !hasExpertMaterials) {
      throw new Error("전문가 평가 자료를 선택해 주세요.");
    }

    if (needsExpertMaterials && !reviewerName) {
      throw new Error("평가자 이름을 입력해 주세요.");
    }

    const resolvedReviewerName = reviewerName || "미지정";

    emitStep(emit, "upload");

    const uploadedAiFiles =
      needsAiMaterials && aiFiles.length > 0 ? await saveUploadedFiles(projectId, aiFiles) : [];
    const uploadedExpertFiles =
      needsExpertMaterials && expertFiles.length > 0
        ? await saveUploadedFiles(projectId, expertFiles)
        : [];
    newlySavedFiles = [...uploadedAiFiles, ...uploadedExpertFiles];

    const savedAiFiles = needsAiMaterials
      ? [...storedRefsToSavedFiles(aiFileRefs), ...uploadedAiFiles]
      : [];
    const savedExpertFiles = needsExpertMaterials
      ? [...storedRefsToSavedFiles(expertFileRefs), ...uploadedExpertFiles]
      : [];

    const evaluatedAt = new Date().toISOString();
    const persistedFiles = [
      ...(needsAiMaterials ? storedRefsToProjectFiles(aiFileRefs, evaluatedAt) : []),
      ...(needsExpertMaterials ? storedRefsToProjectFiles(expertFileRefs, evaluatedAt) : []),
      ...toProjectFiles(newlySavedFiles, evaluatedAt),
    ];

    const { extractDocumentText } = await import("@/lib/document-extract");

    emitStep(emit, "extract");
    const aiFilesForAnalysis = needsAiMaterials
      ? await Promise.all(
          savedAiFiles.map(async (file) => ({
            ...file,
            storagePath: file.storagePath ?? file.storageKey,
            extractedTextPreview: await extractDocumentText(
              await readSavedUploadFile(file),
              file.originalName,
            ),
          })),
        )
      : [];

    const expertFilesForAnalysis = needsExpertMaterials
      ? await Promise.all(
          savedExpertFiles.map(async (file) => ({
            ...file,
            storagePath: file.storagePath ?? file.storageKey,
            extractedTextPreview: await extractDocumentText(
              await readSavedUploadFile(file),
              file.originalName,
            ),
          })),
        )
      : [];

    const aiTextBudget = applyFilesTextBudget(aiFilesForAnalysis);
    const expertTextBudget = applyFilesTextBudget(expertFilesForAnalysis);

    emitStep(emit, "law-context");
    const evaluationContext = await buildEvaluationContext(projectId);
    evaluationContext.warnings = [
      ...evaluationContext.warnings,
      ...aiTextBudget.warnings,
      ...expertTextBudget.warnings,
    ];

    emitStep(emit, "ai-analysis");
    const aiAnalysisPromise = needsAiMaterials
      ? analyzeUploadedFiles({
          providerPreference,
          files: aiTextBudget.files,
          evaluationContext,
          evaluationItems,
        })
      : Promise.resolve(
          createSkippedUploadAnalysis(evaluationContext, evaluationItems, "ai", evaluationContext.warnings),
        );

    emitStep(emit, "expert-analysis");
    const expertAnalysisPromise = needsExpertMaterials
      ? analyzeUploadedFiles({
          providerPreference,
          files: expertTextBudget.files,
          evaluationContext,
          evaluationItems,
        })
      : Promise.resolve(
          createSkippedUploadAnalysis(
            evaluationContext,
            evaluationItems,
            "expert",
            evaluationContext.warnings,
          ),
        );

    const [aiAnalysis, expertAnalysis] = await Promise.all([aiAnalysisPromise, expertAnalysisPromise]);

    const expertItemScores =
      manualExpertScores.length > 0
        ? manualExpertScores
        : needsExpertMaterials
          ? expertAnalysis.evaluationPreview.map((row) => ({
              itemId: row.itemId,
              score: row.score,
              comment: row.rationale,
            }))
          : evaluationItems.map((item) => ({
              itemId: item.id,
              score: 0,
              comment: "전문가 가중치 0% — 자료 분석 생략",
            }));

    const totalPoints = evaluationItems.reduce((sum, item) => sum + item.points, 0);
    const round: EvaluationRound = {
      id: `round-${Date.now()}-${crypto.randomUUID()}`,
      evaluatedAt,
      aiWeight: normalizedAiWeight,
      expertWeight: normalizedExpertWeight,
      evaluationItems,
      totalPoints,
      reviewerName: resolvedReviewerName,
      expertSummary: expertSummary || undefined,
      aiFiles: savedAiFiles.map(toSessionFile),
      expertFiles: savedExpertFiles.map(toSessionFile),
      aiAnalysis: {
        ...aiAnalysis,
        warnings: mergeRoundAnalysisWarnings(
          evaluationContext.warnings,
          aiAnalysis.warnings ?? [],
          expertAnalysis.warnings ?? [],
          aiAnalysis.mode === "demo" && needsAiMaterials
            ? ["AI API 키가 없거나 오류로 데모 분석 결과가 저장되었습니다. 점수는 참고용입니다."]
            : [],
        ),
      },
      expertItemScores,
    };

    emitStep(emit, "save");
    const updatedProject =
      (await addProjectEvaluationRound(projectId, round, persistedFiles)) ??
      (await upsertProjectRecord({
        ...project,
        files: [...project.files, ...persistedFiles],
        evaluationRounds: [...(project.evaluationRounds ?? []), round],
      }));

    newlySavedFiles = [];

    return {
      round,
      project: updatedProject,
      analysisMode: round.aiAnalysis.mode,
      warnings: round.aiAnalysis.warnings ?? [],
    };
  } catch (error) {
    if (newlySavedFiles.length > 0) {
      await deleteSavedUploadFiles(newlySavedFiles);
    }
    throw error;
  }
}

function toSessionFile(file: SavedUploadFile) {
  return {
    id: file.id,
    originalName: file.originalName,
    fileType: file.originalName.split(".").pop()?.toUpperCase() ?? file.fileType,
    sizeBytes: file.sizeBytes,
    storageKey: file.storageKey,
    blobUrl: file.blobUrl,
  };
}
