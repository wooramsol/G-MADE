"use client";

import { useMemo, useState } from "react";
import type { AiProviderPreference } from "@/lib/ai/types";
import { createDefaultEvaluationItems } from "@/lib/evaluation-rounds";
import type { EvaluationItem, EvaluationRound, ProjectFile } from "@/lib/types";
import EvaluationItemsEditor from "./evaluation-items-editor";
import UnifiedEvaluationResults from "./unified-evaluation-results";
import { showToast } from "./toast";

type ParallelEvaluationFormProps = {
  projectId: string;
  savedRounds: EvaluationRound[];
  onRoundSaved?: (round: EvaluationRound, files: ProjectFile[]) => void;
  onRoundsChange?: (rounds: EvaluationRound[]) => void;
};

type EvaluationRoundApiResponse = {
  round: EvaluationRound;
  project?: { evaluationRounds?: EvaluationRound[] };
  error?: string;
};

const FILE_ACCEPT = ".pdf,.docx,.xlsx,.xls,.hwp,.pptx,.jpg,.jpeg,.png,.dwg,.zip,.txt,.md";

export default function ParallelEvaluationForm({
  projectId,
  savedRounds,
  onRoundSaved,
  onRoundsChange,
}: ParallelEvaluationFormProps) {
  const [evaluationItems, setEvaluationItems] = useState<EvaluationItem[]>(createDefaultEvaluationItems);
  const [expertScores, setExpertScores] = useState<Record<string, { score: number; comment: string }>>(
    Object.fromEntries(createDefaultEvaluationItems().map((item) => [item.id, { score: 75, comment: "" }])),
  );
  const [aiFiles, setAiFiles] = useState<File[]>([]);
  const [expertFiles, setExpertFiles] = useState<File[]>([]);
  const [reviewerName, setReviewerName] = useState("");
  const [expertSummary, setExpertSummary] = useState("");
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
    formData.append("projectId", projectId);
    formData.append("provider", provider);
    formData.append("aiWeight", String(aiWeight));
    formData.append("expertWeight", String(100 - aiWeight));
    formData.append("reviewerName", reviewerName.trim());
    if (expertSummary.trim()) formData.append("expertSummary", expertSummary.trim());
    formData.append("evaluationItems", JSON.stringify(evaluationItems));
    formData.append(
      "expertItemScores",
      JSON.stringify(
        evaluationItems.map((item) => ({
          itemId: item.id,
          score: expertScores[item.id]?.score ?? 0,
          comment: expertScores[item.id]?.comment?.trim() || undefined,
        })),
      ),
    );
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
      setExpertSummary("");
      showToast({ message: "하이브리드 평가 분석이 완료되었습니다.", tone: "success" });
      onRoundSaved?.(payload.round, projectFiles);
      if (payload.project?.evaluationRounds) {
        onRoundsChange?.(payload.project.evaluationRounds);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "하이브리드 평가 분석에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <EvaluationItemsEditor
        expertScores={expertScores}
        items={evaluationItems}
        onExpertScoresChange={setExpertScores}
        onItemsChange={(items) => {
          setEvaluationItems(items);
          setExpertScores((current) => {
            const next = { ...current };
            items.forEach((item) => {
              if (!next[item.id]) next[item.id] = { score: 75, comment: "" };
            });
            return next;
          });
        }}
      />

      <div className="rounded-xl border border-[#d7dee8] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold text-[#15345b]">평가 가중치</p>
            <p className="mt-1 text-sm text-[#64748b]">AI와 전문가 평가 비율을 조정합니다.</p>
          </div>
          <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">
            AI {aiWeight}% · 전문가 {100 - aiWeight}%
          </span>
        </div>
        <input
          aria-label="AI 평가 가중치"
          className="mt-4 w-full accent-[#2463b3]"
          max="100"
          min="0"
          step="10"
          type="range"
          value={aiWeight}
          onChange={(event) => setAiWeight(Number(event.target.value))}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <MaterialColumn
          accent="ai"
          description="프로젝트 자료·심의서류 등 AI 분석 대상 파일"
          files={aiFiles}
          title="AI 평가 자료"
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
              <option value="gemini">Gemini (테스트 기본)</option>
              <option value="openai">ChatGPT</option>
              <option value="claude">Claude (Anthropic)</option>
            </select>
          </label>
        </MaterialColumn>

        <MaterialColumn
          accent="expert"
          description="심사위원 평가표·의견서·보완자료 등 전문가 평가 파일"
          files={expertFiles}
          title="전문가 평가 자료"
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
          <label className="mt-3 block text-sm">
            <span className="mb-2 block text-xs font-bold text-[#64748b]">종합 의견 (선택)</span>
            <textarea
              className="min-h-20 w-full rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-2 text-sm leading-6 outline-none focus:border-[#15345b] focus:bg-white"
              placeholder="전문가 종합 의견"
              value={expertSummary}
              onChange={(event) => setExpertSummary(event.target.value)}
            />
          </label>
        </MaterialColumn>
      </div>

      <div className="rounded-xl border border-[#d7dee8] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold text-[#15345b]">하이브리드 평가 분석</p>
            <p className="mt-1 text-sm text-[#64748b]">
              AI·전문가 양쪽 자료와 공통 평가항목을 바탕으로 한 번에 분석합니다.
            </p>
          </div>
          <button
            className="primary-action rounded-xl px-6 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={loading}
            type="button"
            onClick={submitEvaluation}
          >
            {loading ? "분석 중 (최대 20초)..." : "하이브리드 평가 분석"}
          </button>
        </div>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}

      <UnifiedEvaluationResults rounds={savedRounds} />
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
    <section className="flex h-full flex-col rounded-2xl border border-[#d7dee8] bg-[#f8fafc] p-4">
      <div className={`rounded-xl px-4 py-3 ${headerClass}`}>
        <p className="text-sm font-bold">{title}</p>
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
