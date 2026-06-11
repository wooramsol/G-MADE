import { mergeRoundAnalysisWarnings } from "@/lib/analysis-warnings";
import { buildEvaluationContext } from "@/lib/evaluation-context";
import {
  EVALUATION_ANALYSIS_STEPS,
  type EvaluationAnalysisProgressEvent,
} from "@/lib/evaluation-analysis-progress";
import { addProjectEvaluationRound, getProjectById, upsertProjectRecord } from "@/lib/project-store";
import { projectFromClientSnapshot } from "@/lib/safe-project-snapshot";
import { deleteSavedUploadFiles, saveUploadedFiles, toProjectFiles } from "@/lib/save-uploaded-files";
import type { EvaluationItem, EvaluationRound, HumanEvaluationItemScore, Project } from "@/lib/types";
import { analyzeUploadedFiles } from "@/lib/upload-analysis";
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
  let savedFiles: SavedUploadFile[] = [];

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
      aiFiles,
      expertFiles,
      projectSnapshot,
    } = input;

    if (!projectId) {
      throw new Error("프로젝트 ID가 필요합니다.");
    }

    let project = await getProjectById(projectId);
    if (!project) {
      if (projectSnapshot?.id === projectId) {
        project = await upsertProjectRecord(projectFromClientSnapshot(projectSnapshot));
      }
    }

    if (!project) {
      throw new Error("프로젝트를 찾을 수 없습니다. 프로젝트를 다시 등록하거나 페이지를 새로고침해 주세요.");
    }

    if (evaluationItems.length === 0) {
      throw new Error("평가항목을 1개 이상 등록해 주세요.");
    }

    if (aiFiles.length === 0) {
      throw new Error("AI 평가 자료를 선택해 주세요.");
    }

    if (expertFiles.length === 0) {
      throw new Error("전문가 평가 자료를 선택해 주세요.");
    }

    if (!reviewerName) {
      throw new Error("평가자 이름을 입력해 주세요.");
    }

    emitStep(emit, "upload");
    const savedAiFiles = await saveUploadedFiles(aiFiles);
    const savedExpertFiles = await saveUploadedFiles(expertFiles);
    savedFiles = [...savedAiFiles, ...savedExpertFiles];

    const evaluatedAt = new Date().toISOString();
    const persistedFiles = toProjectFiles(savedFiles, evaluatedAt);

    const { readFile } = await import("fs/promises");
    const { extractDocumentText } = await import("@/lib/document-extract");

    emitStep(emit, "extract");
    const [aiFilesForAnalysis, expertFilesForAnalysis] = await Promise.all([
      Promise.all(
        savedAiFiles.map(async (file) => ({
          ...file,
          extractedTextPreview: await extractDocumentText(
            await readFile(file.storagePath),
            file.originalName,
          ),
        })),
      ),
      Promise.all(
        savedExpertFiles.map(async (file) => ({
          ...file,
          extractedTextPreview: await extractDocumentText(
            await readFile(file.storagePath),
            file.originalName,
          ),
        })),
      ),
    ]);

    emitStep(emit, "law-context");
    const evaluationContext = await buildEvaluationContext(projectId);

    emitStep(emit, "ai-analysis");
    const aiAnalysisPromise = analyzeUploadedFiles({
      providerPreference,
      files: aiFilesForAnalysis,
      evaluationContext,
      evaluationItems,
    });

    emitStep(emit, "expert-analysis");
    const expertAnalysisPromise = analyzeUploadedFiles({
      providerPreference,
      files: expertFilesForAnalysis,
      evaluationContext,
      evaluationItems,
    });

    const [aiAnalysis, expertAnalysis] = await Promise.all([aiAnalysisPromise, expertAnalysisPromise]);

    const expertItemScores =
      manualExpertScores.length > 0
        ? manualExpertScores
        : expertAnalysis.evaluationPreview.map((row) => ({
            itemId: row.itemId,
            score: row.score,
            comment: row.rationale,
          }));

    const totalPoints = evaluationItems.reduce((sum, item) => sum + item.points, 0);
    const round: EvaluationRound = {
      id: `round-${Date.now()}-${crypto.randomUUID()}`,
      evaluatedAt,
      aiWeight: Number.isFinite(aiWeight) ? aiWeight : 30,
      expertWeight: Number.isFinite(expertWeight) ? expertWeight : 70,
      evaluationItems,
      totalPoints,
      reviewerName,
      expertSummary: expertSummary || undefined,
      aiFiles: savedAiFiles.map(toSessionFile),
      expertFiles: savedExpertFiles.map(toSessionFile),
      aiAnalysis: {
        ...aiAnalysis,
        warnings: mergeRoundAnalysisWarnings(
          evaluationContext.warnings,
          aiAnalysis.warnings ?? [],
          expertAnalysis.warnings ?? [],
          aiAnalysis.mode === "demo"
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

    savedFiles = [];

    return {
      round,
      project: updatedProject,
      analysisMode: round.aiAnalysis.mode,
      warnings: round.aiAnalysis.warnings ?? [],
    };
  } catch (error) {
    if (savedFiles.length > 0) {
      await deleteSavedUploadFiles(savedFiles);
    }
    throw error;
  }
}

function toSessionFile(file: { id: string; originalName: string; fileType: string; sizeBytes: number }) {
  return {
    id: file.id,
    originalName: file.originalName,
    fileType: file.originalName.split(".").pop()?.toUpperCase() ?? file.fileType,
    sizeBytes: file.sizeBytes,
  };
}
