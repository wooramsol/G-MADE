"use client";

import { useEffect, useMemo, useState } from "react";
import EvaluationWeightSlider from "@/components/evaluation-weight-slider";
import { interactiveCardClassName } from "@/components/interactive-card";
import type { AiProviderPreference } from "@/lib/ai/types";
import { toClientAiProviderPreference } from "@/lib/resolve-ai-provider-preference";
import { createDefaultEvaluationItems } from "@/lib/evaluation-rounds";
import type { EvaluationItem, EvaluationRound, Project, ProjectFile } from "@/lib/types";
import AnalysisBlockingOverlay from "@/components/analysis-blocking-overlay";
import type { EvaluationAnalysisProgressEvent } from "@/lib/evaluation-analysis-progress";
import { submitEvaluationRoundStream } from "@/lib/client-evaluation-stream";
import { buildOversizedUploadMessage } from "@/lib/upload-limits";
import { ErrorText, FieldLabel, MutedText, StepTitle } from "@/components/typography";
import EvaluationItemsEditor from "./evaluation-items-editor";
import { showToast } from "./toast";

type ParallelEvaluationFormProps = {
  project: Project;
  onRoundsChange?: (rounds: EvaluationRound[], files?: ProjectFile[]) => void;
};

type EvaluationRoundApiResponse = {
  round: EvaluationRound;
  project?: { evaluationRounds?: EvaluationRound[] };
  analysisMode?: "live" | "demo";
  warnings?: string[];
  error?: string;
};

const FILE_ACCEPT = ".pdf,.docx,.xlsx,.xls,.hwp,.pptx,.jpg,.jpeg,.png,.dwg,.zip,.txt,.md";

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
  const [aiFiles, setAiFiles] = useState<File[]>([]);
  const [expertFiles, setExpertFiles] = useState<File[]>([]);
  const [reviewerName, setReviewerName] = useState("");
  const [aiWeight, setAiWeight] = useState(30);
  const [provider, setProvider] = useState<AiProviderPreference | null>(null);
  const [loading, setLoading] = useState(false);
  const [analysisStartedAt, setAnalysisStartedAt] = useState<number | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<EvaluationAnalysisProgressEvent | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadDefaultProvider() {
      try {
        const response = await fetch("/api/ai-status");
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

  useEffect(() => {
    if (itemsDirty) return;

    const nextItems = project.savedEvaluationItems?.length
      ? project.savedEvaluationItems.map((item) => ({ ...item }))
      : createDefaultEvaluationItems();
    setEvaluationItems(nextItems);
  }, [itemsDirty, project.id, project.savedEvaluationItems]);

  const aiTotalSize = useMemo(() => aiFiles.reduce((sum, file) => sum + file.size, 0), [aiFiles]);
  const expertTotalSize = useMemo(() => expertFiles.reduce((sum, file) => sum + file.size, 0), [expertFiles]);

  async function submitEvaluation() {
    if (loading || !provider) return;

    if (itemsDirty) {
      setError("평가항목을 먼저 저장한 뒤 분석을 실행해 주세요.");
      return;
    }

    if (aiFiles.length === 0) {
      setError("AI 평가 자료를 선택해 주세요.");
      return;
    }

    if (expertFiles.length === 0) {
      setError("전문가 평가 자료를 선택해 주세요.");
      return;
    }

    if (!reviewerName.trim()) {
      setError("평가자 이름을 입력해 주세요.");
      return;
    }

    const oversizedMessage =
      buildOversizedUploadMessage(aiFiles, "AI 평가") ||
      buildOversizedUploadMessage(expertFiles, "전문가 평가");
    if (oversizedMessage) {
      setError(oversizedMessage);
      return;
    }

    setLoading(true);
    setAnalysisStartedAt(Date.now());
    setAnalysisProgress(null);
    setError("");

    const formData = new FormData();
    formData.append("projectId", project.id);
    formData.append("projectSnapshot", JSON.stringify(project));
    formData.append("provider", provider);
    formData.append("aiWeight", String(aiWeight));
    formData.append("expertWeight", String(100 - aiWeight));
    formData.append("reviewerName", reviewerName.trim());
    formData.append("evaluationItems", JSON.stringify(evaluationItems));
    aiFiles.forEach((file) => formData.append("aiFiles", file));
    expertFiles.forEach((file) => formData.append("expertFiles", file));

    try {
      const payload = await submitEvaluationRoundStream(formData, (progress) => {
        setAnalysisProgress(progress);
      });

      const uploadedAt = payload.round.evaluatedAt;
      const projectFiles: ProjectFile[] = [
        ...payload.round.aiFiles.map((file) => toProjectFile(file, uploadedAt)),
        ...payload.round.expertFiles.map((file) => toProjectFile(file, uploadedAt)),
      ];

      setAiFiles([]);
      setExpertFiles([]);

      const isDemo =
        payload.analysisMode === "demo" || payload.round.aiAnalysis.mode === "demo";

      if (isDemo) {
        showToast({
          message:
            "데모 분석 결과가 저장되었습니다. AI API 키를 설정한 뒤 다시 분석하면 실제 결과를 받을 수 있습니다.",
          tone: "info",
        });
      } else {
        showToast({ message: "하이브리드 평가 분석이 완료되었습니다.", tone: "success" });
      }

      const nextRounds = resolveNextEvaluationRounds(project, {
        round: payload.round,
        project: payload.project,
        analysisMode: payload.analysisMode,
      });
      onRoundsChange?.(nextRounds, projectFiles);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "하이브리드 평가 분석에 실패했습니다.");
    } finally {
      setLoading(false);
      setAnalysisStartedAt(null);
      setAnalysisProgress(null);
    }
  }

  return (
    <div className="space-y-5">
      {loading && analysisStartedAt ? (
        <AnalysisBlockingOverlay progress={analysisProgress} startedAt={analysisStartedAt} />
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
            슬라이더를 움직여 AI(왼쪽)와 전문가(오른쪽) 평가 비율을 조정합니다.
          </MutedText>
        </div>
        <EvaluationWeightSlider aiWeight={aiWeight} onChange={setAiWeight} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <MaterialColumn
          accent="ai"
          description="프로젝트 자료·심의서류 등 AI 분석 대상 파일"
          files={aiFiles}
          title="3. AI 평가 자료"
          totalSize={aiTotalSize}
          onFilesChange={setAiFiles}
        >
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
        </MaterialColumn>

        <MaterialColumn
          accent="expert"
          description="심사위원 평가표·의견서·보완자료 등 전문가 평가 파일"
          files={expertFiles}
          title="4. 전문가 평가 자료"
          totalSize={expertTotalSize}
          onFilesChange={setExpertFiles}
        >
          <label className="block text-sm">
            <FieldLabel className="mb-2 block">평가자 / 심사위원</FieldLabel>
            <input
              className="w-full rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-2 font-semibold text-[#15345b] outline-none focus:border-[#15345b] focus:bg-white"
              placeholder="예: 홍길동 위원"
              value={reviewerName}
              onChange={(event) => setReviewerName(event.target.value)}
            />
          </label>
        </MaterialColumn>
      </div>

      <div
        className={`rounded-2xl border-2 border-[#2463b3]/35 bg-gradient-to-b from-[#eef4fb] to-white p-6 shadow-sm ring-1 ring-[#2463b3]/10 ${interactiveCardClassName}`}
      >
        <div className="text-center">
          <StepTitle>5. 하이브리드 평가 분석</StepTitle>
          <MutedText className="mx-auto mt-2 max-w-lg">
            AI·전문가 양쪽 자료와 공통 평가항목을 바탕으로 한 번에 분석합니다.
          </MutedText>
          <button
            className="primary-action mt-5 rounded-xl px-8 py-3.5 text-base font-bold disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={loading || itemsDirty || !provider}
            type="button"
            onClick={submitEvaluation}
          >
            {loading ? "분석 중 (최대 2분)..." : "하이브리드 평가 분석"}
          </button>
          {itemsDirty ? (
            <p className="mt-3 text-xs font-semibold text-amber-800">
              평가항목 변경 사항을 저장한 뒤 분석을 실행할 수 있습니다.
            </p>
          ) : null}
        </div>
      </div>

      {error ? <ErrorText className="rounded-xl bg-red-50 p-3">{error}</ErrorText> : null}
    </div>
  );
}

function MaterialColumn({
  accent,
  title,
  description,
  files,
  totalSize,
  onFilesChange,
  children,
}: {
  accent: "ai" | "expert";
  title: string;
  description: string;
  files: File[];
  totalSize: number;
  onFilesChange: (files: File[]) => void;
  children: React.ReactNode;
}) {
  const isAi = accent === "ai";
  const headerClass = isAi ? "bg-[#eef4fb] text-[#2463b3]" : "bg-slate-100 text-[#15345b]";
  const borderClass = isAi ? "border-[#2463b3]" : "border-[#15345b]";

  return (
    <section
      className={`flex h-full flex-col rounded-2xl border border-[#d7dee8] bg-[#f8fafc] p-4 ${interactiveCardClassName}`}
    >
      <div className={`rounded-xl px-4 py-3 ${headerClass}`}>
        <StepTitle>{title}</StepTitle>
        <p className="mt-1 text-xs leading-5 opacity-80">{description}</p>
      </div>

      <label
        className={`mt-4 flex min-h-52 flex-1 cursor-pointer flex-col rounded-xl border border-dashed bg-white p-4 text-sm text-[#475569] ${borderClass}`}
      >
        <span className="font-bold text-[#15345b]">자료 업로드</span>
        <span className="mt-1 leading-6">
          PDF, DOCX, XLSX, HWP, PPTX, JPG, PNG, ZIP · 파일당 최대 25MB
        </span>
        <input
          className="mt-4 text-sm"
          multiple
          type="file"
          accept={FILE_ACCEPT}
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            if (picked.length > 0) {
              onFilesChange([...files, ...picked]);
            }
            event.target.value = "";
          }}
        />
        {files.length > 0 ? (
          <div className="mt-4 rounded-xl bg-[#f8fafc] p-3">
            <p className="font-semibold text-[#15345b]">
              선택 {files.length}개 · {formatBytes(totalSize)}
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              {files.map((file, index) => (
                <li key={`${file.name}-${file.size}-${index}`}>
                  {file.name} ({formatBytes(file.size)})
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </label>

      <div className="mt-4 rounded-xl border border-[#d7dee8] bg-white p-4">{children}</div>
    </section>
  );
}

function resolveNextEvaluationRounds(
  project: ParallelEvaluationFormProps["project"],
  payload: EvaluationRoundApiResponse,
): EvaluationRound[] {
  const existing = project.evaluationRounds ?? [];
  const fromServer = payload.project?.evaluationRounds ?? [];
  const byId = new Map<string, EvaluationRound>();

  for (const round of [...existing, ...fromServer, payload.round]) {
    byId.set(round.id, round);
  }

  return Array.from(byId.values()).sort(
    (left, right) => new Date(right.evaluatedAt).getTime() - new Date(left.evaluatedAt).getTime(),
  );
}

function toProjectFile(
  file: { id: string; originalName: string; fileType: string; sizeBytes: number },
  uploadedAt: string,
): ProjectFile {
  return {
    id: file.id,
    fileName: file.originalName,
    fileType: file.originalName.split(".").pop()?.toUpperCase() ?? file.fileType,
    analysisStatus: "완료",
    uploadedAt,
    sizeBytes: file.sizeBytes,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}
