"use client";

import { useEffect, useMemo, useState } from "react";
import EvaluationWeightSlider from "@/components/evaluation-weight-slider";
import { interactiveCardClassName } from "@/components/interactive-card";
import type { AiProviderPreference } from "@/lib/ai/types";
import { uploadProjectFilesToBlob } from "@/lib/client-blob-upload";
import { exceedsServerlessUploadLimit, SERVERLESS_UPLOAD_LIMIT_LABEL } from "@/lib/blob-config";
import { toClientAiProviderPreference } from "@/lib/resolve-ai-provider-preference";
import { createDefaultEvaluationItems } from "@/lib/evaluation-rounds";
import {
  DEFAULT_AI_WEIGHT,
  getExpertWeight,
  requiresAiUploadMaterials,
  requiresEvaluationUploadMaterials,
  requiresExpertUploadMaterials,
  validateEvaluationWeights,
} from "@/lib/evaluation-weight-requirements";
import { collectUniqueRoundFiles } from "@/lib/evaluation-round-files";
import { collectProjectStoredFiles } from "@/lib/project-file-pool";
import { storedRefToProjectFile } from "@/lib/stored-file-ref";
import type { StoredFileRef } from "@/lib/stored-file-ref";
import type { EvaluationItem, EvaluationRound, Project, ProjectFile } from "@/lib/types";
import AnalysisBlockingOverlay from "@/components/analysis-blocking-overlay";
import type { EvaluationAnalysisProgressEvent } from "@/lib/evaluation-analysis-progress";
import { submitEvaluationRoundStream } from "@/lib/client-evaluation-stream";
import { buildOversizedUploadMessage } from "@/lib/upload-limits";
import { ErrorText, FieldLabel, MutedText, StepTitle } from "@/components/typography";
import EvaluationItemsEditor from "./evaluation-items-editor";
import EvaluationMaterialsSection from "./evaluation-materials-section";
import { showToast } from "./toast";
import { clientFetchWithTimeout } from "@/lib/client-fetch-with-timeout";

type ParallelEvaluationFormProps = {
  project: Project;
  onRoundsChange?: (rounds: EvaluationRound[], files?: ProjectFile[]) => void;
};

type EvaluationRoundApiResponse = {
  round: EvaluationRound;
  project?: { evaluationRounds?: EvaluationRound[] };
  analysisMode?: "live" | "skipped" | "demo";
  warnings?: string[];
  error?: string;
};

export default function ParallelEvaluationForm({
  project,
  onRoundsChange,
}: ParallelEvaluationFormProps) {
  const [evaluationItems, setEvaluationItems] = useState<EvaluationItem[]>(() =>
    project.savedEvaluationItems?.length
      ? project.savedEvaluationItems.map((item) => ({ ...item }))
      : createDefaultEvaluationItems(),
  );
  const [itemsDirty, setItemsDirty] = useState(false);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [selectedRefs, setSelectedRefs] = useState<StoredFileRef[]>([]);
  const [reviewerName, setReviewerName] = useState("");
  const [aiWeight, setAiWeight] = useState(DEFAULT_AI_WEIGHT);
  const [provider, setProvider] = useState<AiProviderPreference | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<EvaluationAnalysisProgressEvent | null>(null);
  const [error, setError] = useState("");

  const expertWeight = getExpertWeight(aiWeight);
  const needsAiMaterials = requiresAiUploadMaterials(aiWeight);
  const needsExpertMaterials = requiresExpertUploadMaterials(expertWeight);

  const needsMaterials = requiresEvaluationUploadMaterials(aiWeight, expertWeight);

  const storedFiles = useMemo(() => collectProjectStoredFiles(project), [project]);

  useEffect(() => {
    let cancelled = false;

    async function loadDefaultProvider() {
      try {
        const response = await clientFetchWithTimeout("/api/ai-status");
        if (!response.ok) {
          if (!cancelled) setProvider("gemini");
          return;
        }
        const payload = (await response.json()) as { defaultProvider?: string };
        if (!cancelled) {
          setProvider(toClientAiProviderPreference(payload.defaultProvider ?? "gemini"));
        }
      } catch {
        if (!cancelled) setProvider("gemini");
      }
    }

    void loadDefaultProvider();
    return () => {
      cancelled = true;
    };
  }, []);

  // 서버에서 저장된 평가항목이 갱신되면(편집 중이 아닐 때만) 렌더 중에 동기화한다.
  const [lastSavedItemsSource, setLastSavedItemsSource] = useState(project.savedEvaluationItems);
  if (lastSavedItemsSource !== project.savedEvaluationItems) {
    setLastSavedItemsSource(project.savedEvaluationItems);
    if (!itemsDirty) {
      setEvaluationItems(
        project.savedEvaluationItems?.length
          ? project.savedEvaluationItems.map((item) => ({ ...item }))
          : createDefaultEvaluationItems(),
      );
    }
  }

  const totalSize = useMemo(
    () =>
      newFiles.reduce((sum, file) => sum + file.size, 0) +
      selectedRefs.reduce((sum, file) => sum + file.sizeBytes, 0),
    [newFiles, selectedRefs],
  );

  async function submitEvaluation() {
    if (loading || (needsAiMaterials && !provider)) return;

    if (itemsDirty) {
      setError("평가항목을 먼저 저장한 뒤 분석을 실행해 주세요.");
      return;
    }

    const weightError = validateEvaluationWeights(aiWeight, expertWeight);
    if (weightError) {
      setError(weightError);
      return;
    }

    if (needsMaterials && newFiles.length === 0 && selectedRefs.length === 0) {
      setError("평가 자료를 선택해 주세요.");
      return;
    }

    const oversizedMessage = needsMaterials ? buildOversizedUploadMessage(newFiles, "평가") : null;
    if (oversizedMessage) {
      setError(oversizedMessage);
      return;
    }

    setLoading(true);
    setUploadProgress(null);
    setAnalysisStartedAt(Date.now());
    setAnalysisProgress(null);
    setError("");

    const formData = new FormData();
    formData.append("projectId", project.id);
    formData.append("projectSnapshot", JSON.stringify(project));
    formData.append("provider", provider ?? "gemini");
    formData.append("aiWeight", String(aiWeight));
    formData.append("expertWeight", String(100 - aiWeight));
    formData.append("reviewerName", reviewerName.trim());
    formData.append("evaluationItems", JSON.stringify(evaluationItems));

    let uploadedRefs: StoredFileRef[] = [];
    const newUploadBytes = newFiles.reduce((sum, file) => sum + file.size, 0);

    try {
      if (newFiles.length > 0) {
        setUploadProgress("자료를 Blob에 업로드하는 중...");
        uploadedRefs = await uploadProjectFilesToBlob(project, newFiles, (fileIndex, ratio) => {
          setUploadProgress(
            `평가 자료 업로드 중 (${fileIndex + 1}/${newFiles.length}) · ${Math.round(ratio * 100)}%`,
          );
        });
      }

      const fileRefs = [...selectedRefs, ...uploadedRefs];
      formData.append("fileRefs", JSON.stringify(fileRefs));

      setUploadProgress(null);

      const payload = await submitEvaluationRoundStream(formData, (progress) => {
        setAnalysisProgress(progress);
      });

      const uploadedAt = payload.round.evaluatedAt;
      const projectFiles: ProjectFile[] = collectUniqueRoundFiles(payload.round).map((file) =>
        toProjectFile(file, uploadedAt),
      );

      setNewFiles([]);
      setSelectedRefs([]);

      showToast({ message: "하이브리드 평가 분석이 완료되었습니다.", tone: "success" });

      const nextRounds = resolveNextEvaluationRounds(project, {
        round: payload.round,
        project: payload.project,
        analysisMode: payload.analysisMode,
      });
      onRoundsChange?.(nextRounds, projectFiles);
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "하이브리드 평가 분석에 실패했습니다.";
      if (exceedsServerlessUploadLimit(newUploadBytes) && message.includes("Request Entity Too Large")) {
        setError(
          `대용량 파일은 Blob 업로드가 필요합니다. Vercel Storage → g-made-blob이 g-made 프로젝트에 연결됐는지 확인한 뒤 Redeploy 해 주세요. (서버 직접 업로드 한도: ${SERVERLESS_UPLOAD_LIMIT_LABEL})`,
        );
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
      setUploadProgress(null);
      setAnalysisStartedAt(null);
      setAnalysisProgress(null);
    }
  }

  return (
    <div className="space-y-5">
      {loading && analysisStartedAt ? (
        <AnalysisBlockingOverlay
          progress={analysisProgress}
          startedAt={analysisStartedAt}
          statusMessage={uploadProgress ?? undefined}
        />
      ) : null}

      <EvaluationItemsEditor
        items={evaluationItems}
        project={project}
        onDirtyChange={setItemsDirty}
        onItemsChange={setEvaluationItems}
        onSaved={setEvaluationItems}
      />

      <div className={`rounded-xl border border-[#d7dee8] bg-white p-4 ${interactiveCardClassName}`}>
        <div>
          <StepTitle>2. 평가 가중치</StepTitle>
          <MutedText className="mt-1">
            슬라이더로 AI(왼쪽)와 전문가(오른쪽) 평가 비율을 조정합니다. 한쪽이 0%이면 해당 쪽 점수만
            산출하며, 평가 자료는 한 번만 올리면 AI·전문가 분석에 공통으로 사용됩니다.
          </MutedText>
        </div>
        <EvaluationWeightSlider aiWeight={aiWeight} onChange={setAiWeight} />
      </div>

      <EvaluationMaterialsSection
        filesRequired={needsMaterials}
        newFiles={newFiles}
        selectedRefs={selectedRefs}
        storedFiles={storedFiles}
        totalSize={totalSize}
        onNewFilesChange={setNewFiles}
        onSelectedRefsChange={setSelectedRefs}
      >
        <div className={`grid gap-4 ${needsAiMaterials && needsExpertMaterials ? "sm:grid-cols-2" : ""}`}>
          {needsAiMaterials ? (
            <label className="block text-sm">
              <FieldLabel className="mb-2 block">AI 엔진</FieldLabel>
              <select
                className="w-full rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-2 font-semibold text-[#15345b] outline-none focus:border-[#2463b3] focus:bg-white disabled:opacity-60"
                disabled={!provider}
                value={provider ?? "gemini"}
                onChange={(event) => setProvider(event.target.value as AiProviderPreference)}
              >
                <option value="gemini">Gemini</option>
                <option value="openai">ChatGPT</option>
                <option value="claude">Claude</option>
              </select>
            </label>
          ) : null}
          {needsExpertMaterials ? (
            <label className="block text-sm">
              <FieldLabel className="mb-2 block">평가자 / 심사위원 (선택)</FieldLabel>
              <input
                className="w-full rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-2 font-semibold text-[#15345b] outline-none focus:border-[#15345b] focus:bg-white"
                placeholder="예: 홍길동 위원 (미입력 시 미지정)"
                value={reviewerName}
                onChange={(event) => setReviewerName(event.target.value)}
              />
            </label>
          ) : null}
        </div>
      </EvaluationMaterialsSection>

      <div
        className={`rounded-2xl border-2 border-[#2463b3]/35 bg-gradient-to-b from-[#eef4fb] to-white p-6 shadow-sm ring-1 ring-[#2463b3]/10 ${interactiveCardClassName}`}
      >
        <div className="text-center">
          <StepTitle>4. 하이브리드 평가 분석</StepTitle>
          <MutedText className="mx-auto mt-2 max-w-lg">
            공통 평가 자료와 평가항목을 바탕으로 AI·전문가 점수를 한 번에 산출합니다. 이전 평가에 올린
            자료는 다시 업로드하지 않고 불러올 수 있습니다.
          </MutedText>
          <button
            className="primary-action mt-5 rounded-xl px-8 py-3.5 text-base font-bold disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={loading || itemsDirty || (needsAiMaterials && !provider)}
            type="button"
            onClick={submitEvaluation}
          >
            {loading ? (uploadProgress ?? "분석 중 (최대 5분)...") : "하이브리드 평가 분석"}
          </button>
          {itemsDirty ? (
            <p className="mt-3 text-xs font-semibold text-amber-800">
              평가항목 변경 사항을 저장한 뒤 분석을 실행할 수 있습니다.
            </p>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-bold text-red-900">평가를 완료하지 못했습니다</p>
          <ErrorText className="mt-2 whitespace-pre-wrap">{error}</ErrorText>
          <p className="mt-3 text-xs leading-5 text-red-800">
            AI API 오류 시 샘플(데모) 결과는 더 이상 저장하지 않습니다. 마이페이지의 연결 테스트와 오류
            메시지를 확인한 뒤 Vercel 환경 변수·모델 설정을 점검해 주세요.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function resolveNextEvaluationRounds(
  project: ParallelEvaluationFormProps["project"],
  payload: EvaluationRoundApiResponse,
): EvaluationRound[] {
  if (Array.isArray(payload.project?.evaluationRounds)) {
    return payload.project.evaluationRounds;
  }

  const existing = project.evaluationRounds ?? [];
  const byId = new Map(existing.map((round) => [round.id, round]));
  byId.set(payload.round.id, payload.round);

  return Array.from(byId.values()).sort(
    (left, right) => new Date(right.evaluatedAt).getTime() - new Date(left.evaluatedAt).getTime(),
  );
}

function toProjectFile(
  file: {
    id: string;
    originalName: string;
    fileType: string;
    sizeBytes: number;
    storageKey?: string;
    blobUrl?: string;
  },
  uploadedAt: string,
): ProjectFile {
  if (file.storageKey) {
    return storedRefToProjectFile(
      {
        id: file.id,
        originalName: file.originalName,
        fileType: file.originalName.split(".").pop()?.toUpperCase() ?? file.fileType,
        sizeBytes: file.sizeBytes,
        storageKey: file.storageKey,
        blobUrl: file.blobUrl,
        uploadedAt,
      },
      uploadedAt,
    );
  }

  return {
    id: file.id,
    fileName: file.originalName,
    fileType: file.originalName.split(".").pop()?.toUpperCase() ?? file.fileType,
    analysisStatus: "완료",
    uploadedAt,
    sizeBytes: file.sizeBytes,
  };
}
