"use client";

import { useMemo, useState } from "react";
import EvaluationWeightSlider from "@/components/evaluation-weight-slider";
import { interactiveCardClassName } from "@/components/interactive-card";
import type { AiProviderPreference } from "@/lib/ai/types";
import { createDefaultEvaluationItems } from "@/lib/evaluation-rounds";
import type { EvaluationItem, EvaluationRound, Project, ProjectFile } from "@/lib/types";
import AnalysisBlockingOverlay from "@/components/analysis-blocking-overlay";
import { scrollToHybridEvaluationResults } from "@/lib/scroll-to-hybrid-evaluation-results";
import EvaluationItemsEditor from "./evaluation-items-editor";
import { showToast } from "./toast";

type ParallelEvaluationFormProps = {
  project: Project;
  onRoundsChange?: (rounds: EvaluationRound[], files?: ProjectFile[]) => void;
};

type EvaluationRoundApiResponse = {
  round: EvaluationRound;
  project?: { evaluationRounds?: EvaluationRound[] };
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
  const [aiFiles, setAiFiles] = useState<File[]>([]);
  const [expertFiles, setExpertFiles] = useState<File[]>([]);
  const [reviewerName, setReviewerName] = useState("");
  const [aiWeight, setAiWeight] = useState(30);
  const [provider, setProvider] = useState<AiProviderPreference>("gemini");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const aiTotalSize = useMemo(() => aiFiles.reduce((sum, file) => sum + file.size, 0), [aiFiles]);
  const expertTotalSize = useMemo(() => expertFiles.reduce((sum, file) => sum + file.size, 0), [expertFiles]);

  async function submitEvaluation() {
    if (loading) return;

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

    setLoading(true);
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
      const response = await fetch("/api/evaluation-rounds", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as EvaluationRoundApiResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "하이브리드 평가 분석에 실패했습니다.");
      }

      const uploadedAt = payload.round.evaluatedAt;
      const projectFiles: ProjectFile[] = [
        ...payload.round.aiFiles.map((file) => toProjectFile(file, uploadedAt)),
        ...payload.round.expertFiles.map((file) => toProjectFile(file, uploadedAt)),
      ];

      setAiFiles([]);
      setExpertFiles([]);
      showToast({ message: "하이브리드 평가 분석이 완료되었습니다.", tone: "success" });
      const nextRounds = resolveNextEvaluationRounds(project, payload);
      onRoundsChange?.(nextRounds, projectFiles);
      scrollToHybridEvaluationResults();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "하이브리드 평가 분석에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {loading ? <AnalysisBlockingOverlay /> : null}

      <EvaluationItemsEditor
        items={evaluationItems}
        project={project}
        onItemsChange={setEvaluationItems}
        onSaved={setEvaluationItems}
      />

      <div className={`rounded-xl border border-[#d7dee8] bg-white p-4 ${interactiveCardClassName}`}>
        <div>
          <p className="font-bold text-[#15345b]">2. 평가 가중치</p>
          <p className="mt-1 text-sm text-[#64748b]">
            슬라이더를 움직여 AI(왼쪽)와 전문가(오른쪽) 평가 비율을 조정합니다.
          </p>
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
            <span className="mb-2 block text-xs font-bold text-[#64748b]">AI 엔진</span>
            <select
              className="w-full rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-2 font-semibold text-[#15345b] outline-none focus:border-[#2463b3] focus:bg-white"
              value={provider}
              onChange={(event) => setProvider(event.target.value as AiProviderPreference)}
            >
              <option value="gemini">Gemini (기본)</option>
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
            <span className="mb-2 block text-xs font-bold text-[#64748b]">평가자 / 심사위원</span>
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
          <p className="text-lg font-black text-[#15345b]">5. 하이브리드 평가 분석</p>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#64748b]">
            AI·전문가 양쪽 자료와 공통 평가항목을 바탕으로 한 번에 분석합니다.
          </p>
          <button
            className="primary-action mt-5 rounded-xl px-8 py-3.5 text-base font-bold disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={loading}
            type="button"
            onClick={submitEvaluation}
          >
            {loading ? "분석 중 (최대 20초)..." : "하이브리드 평가 분석"}
          </button>
        </div>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}
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
        <p className="font-bold">{title}</p>
        <p className="mt-1 text-xs leading-5 opacity-80">{description}</p>
      </div>

      <label
        className={`mt-4 flex min-h-52 flex-1 cursor-pointer flex-col rounded-xl border border-dashed bg-white p-4 text-sm text-[#475569] ${borderClass}`}
      >
        <span className="font-bold text-[#15345b]">자료 업로드</span>
        <span className="mt-1 leading-6">PDF, DOCX, XLSX, HWP, PPTX, JPG, PNG, ZIP</span>
        <input
          className="mt-4 text-sm"
          multiple
          type="file"
          accept={FILE_ACCEPT}
          onChange={(event) => onFilesChange(Array.from(event.target.files ?? []))}
        />
        {files.length > 0 ? (
          <div className="mt-4 rounded-xl bg-[#f8fafc] p-3">
            <p className="font-semibold text-[#15345b]">
              선택 {files.length}개 · {formatBytes(totalSize)}
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              {files.map((file) => (
                <li key={`${file.name}-${file.size}`}>
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
  if (payload.project?.evaluationRounds?.length) {
    return payload.project.evaluationRounds;
  }

  const existing = project.evaluationRounds ?? [];
  if (existing.some((round) => round.id === payload.round.id)) {
    return existing;
  }

  return [...existing, payload.round];
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
