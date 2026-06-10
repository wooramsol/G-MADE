"use client";

import { useMemo, useState } from "react";
import {
  Badge,
  Caption,
  ErrorText,
  FieldLabel,
  MutedText,
  StepTitle,
} from "@/components/typography";
import { evaluationItems } from "@/lib/demo-data";
import type { HumanEvaluationSession, ProjectFile } from "@/lib/types";
import { ExpertEvaluationResultsPanel } from "./expert-evaluation-panels";
import { showToast } from "./toast";

type ExpertEvaluationApiResponse = {
  session: HumanEvaluationSession;
  files: Array<{
    id: string;
    originalName: string;
    fileType: string;
    sizeBytes: number;
  }>;
  error?: string;
};

type ExpertEvaluationUploaderProps = {
  projectId: string;
  savedSessions?: HumanEvaluationSession[];
  onEvaluationSaved?: (session: HumanEvaluationSession, files: ProjectFile[]) => void;
};

export default function ExpertEvaluationUploader({
  projectId,
  savedSessions = [],
  onEvaluationSaved,
}: ExpertEvaluationUploaderProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [reviewerName, setReviewerName] = useState("");
  const [summary, setSummary] = useState("");
  const [itemScores, setItemScores] = useState<Record<string, { score: number; comment: string }>>(
    Object.fromEntries(
      evaluationItems.map((item) => [item.id, { score: 75, comment: "" }]),
    ),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const totalSize = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files],
  );

  function updateItemScore(itemId: string, field: "score" | "comment", value: string) {
    setItemScores((current) => ({
      ...current,
      [itemId]: {
        score:
          field === "score"
            ? Math.max(0, Math.min(100, Number(value) || 0))
            : (current[itemId]?.score ?? 0),
        comment: field === "comment" ? value : (current[itemId]?.comment ?? ""),
      },
    }));
  }

  async function submitEvaluation() {
    if (loading) return;

    if (!reviewerName.trim()) {
      setError("평가자 이름을 입력해 주세요.");
      return;
    }

    if (files.length === 0) {
      setError("전문가 평가 자료 파일을 선택해 주세요.");
      return;
    }

    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("projectId", projectId);
    formData.append("reviewerName", reviewerName.trim());
    if (summary.trim()) {
      formData.append("summary", summary.trim());
    }
    formData.append(
      "itemScores",
      JSON.stringify(
        evaluationItems.map((item) => ({
          itemId: item.id,
          score: itemScores[item.id]?.score ?? 0,
          comment: itemScores[item.id]?.comment?.trim() || undefined,
        })),
      ),
    );
    files.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/expert-evaluations", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as ExpertEvaluationApiResponse;

      if (!response.ok) {
        throw new Error(payload.error ?? "전문가 평가 자료 업로드에 실패했습니다.");
      }

      const uploadedAt = payload.session.uploadedAt;
      const projectFiles: ProjectFile[] = payload.files.map((file) => ({
        id: file.id,
        fileName: file.originalName,
        fileType: file.originalName.split(".").pop()?.toUpperCase() ?? file.fileType,
        analysisStatus: "완료",
        uploadedAt,
        sizeBytes: file.sizeBytes,
      }));

      setFiles([]);
      setSummary("");
      showToast({ message: "전문가 평가 자료가 등록되었습니다.", tone: "success" });
      onEvaluationSaved?.(payload.session, projectFiles);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "전문가 평가 자료 업로드에 실패했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5 rounded-2xl border border-[#d7dee8] bg-[#f8fafc] p-4">
      <div className="rounded-xl border border-[#d7dee8] bg-white px-4 py-3">
        <StepTitle>인간 전문가 평가</StepTitle>
        <Caption className="mt-1">
          심사위원·전문가가 작성한 평가표, 의견서, 보완자료를 업로드하고 항목별 점수를 입력합니다.
          AI 분석과 병행하여 하이브리드 종합 점수에 반영됩니다.
        </Caption>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <label className="flex min-h-48 cursor-pointer flex-col rounded-xl border border-dashed border-[#15345b] bg-white p-4 text-sm text-[#475569]">
          <StepTitle>1. 평가 자료 선택</StepTitle>
          <span className="mt-1 leading-6">
            PDF, DOCX, XLSX, HWP, PPTX, JPG, PNG 등 전문가 평가 자료를 업로드합니다.
          </span>
          <input
            className="mt-4 text-sm"
            multiple
            type="file"
            accept=".pdf,.docx,.xlsx,.xls,.hwp,.pptx,.jpg,.jpeg,.png,.zip,.txt,.md"
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
          {files.length > 0 ? (
            <div className="mt-4 rounded-xl bg-[#f8fafc] p-3 text-sm text-[#475569]">
              <p className="font-semibold text-[#15345b]">
                선택된 파일 {files.length}개 · {formatBytes(totalSize)}
              </p>
              <ul className="mt-2 space-y-1">
                {files.map((file) => (
                  <li key={`${file.name}-${file.size}`}>
                    - {file.name} ({formatBytes(file.size)})
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </label>

        <div className="min-h-48 rounded-xl border border-[#d7dee8] bg-white p-4 text-sm">
          <StepTitle>2. 평가자 정보</StepTitle>
          <label className="mt-4 block">
            <FieldLabel className="mb-2 block">평가자 / 심사위원</FieldLabel>
            <input
              className="w-full rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-2 font-semibold text-[#15345b] outline-none focus:border-[#15345b] focus:bg-white"
              placeholder="예: 홍길동 위원"
              value={reviewerName}
              onChange={(event) => setReviewerName(event.target.value)}
            />
          </label>
          <label className="mt-4 block">
            <FieldLabel className="mb-2 block">종합 의견 (선택)</FieldLabel>
            <textarea
              className="min-h-24 w-full rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-2 text-sm leading-6 text-[#15345b] outline-none focus:border-[#15345b] focus:bg-white"
              placeholder="전문가 종합 의견을 입력합니다."
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
            />
          </label>
        </div>
      </div>

      <div className="rounded-xl border border-[#d7dee8] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <StepTitle>3. 항목별 점수 입력</StepTitle>
            <MutedText className="mt-1">
              업로드한 평가 자료를 바탕으로 항목별 점수와 의견을 입력합니다.
            </MutedText>
          </div>
          <Badge className="bg-slate-100 text-slate-700">전문가 평가</Badge>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-[#d7dee8]">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="bg-[#eef4fb] text-[#15345b]">
              <tr>
                <th className="px-4 py-3">세부항목</th>
                <th className="w-28 px-4 py-3">점수</th>
                <th className="px-4 py-3">평가 의견</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d7dee8] bg-white">
              {evaluationItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-[#15345b]">{item.detailItem}</p>
                    <p className="mt-1 text-xs text-[#64748b]">
                      {item.majorCategory} · {item.middleCategory}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <input
                      aria-label={`${item.detailItem} 점수`}
                      className="w-20 rounded-lg border border-[#d7dee8] bg-[#f8fafc] px-3 py-2 text-sm font-bold text-[#15345b] outline-none focus:border-[#15345b] focus:bg-white"
                      min="0"
                      max="100"
                      type="number"
                      value={itemScores[item.id]?.score ?? 0}
                      onChange={(event) => updateItemScore(item.id, "score", event.target.value)}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <input
                      aria-label={`${item.detailItem} 의견`}
                      className="w-full rounded-lg border border-[#d7dee8] bg-[#f8fafc] px-3 py-2 text-sm text-[#15345b] outline-none focus:border-[#15345b] focus:bg-white"
                      placeholder="항목별 평가 의견"
                      value={itemScores[item.id]?.comment ?? ""}
                      onChange={(event) => updateItemScore(item.id, "comment", event.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-[#d7dee8] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <StepTitle>4. 전문가 평가 등록</StepTitle>
            <MutedText className="mt-1">자료와 점수를 확인한 뒤 전문가 평가를 등록합니다.</MutedText>
          </div>
          <button
            className="rounded-xl bg-[#15345b] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={loading}
            type="button"
            onClick={submitEvaluation}
          >
            {loading ? "등록 중..." : "전문가 평가 등록"}
          </button>
        </div>
      </div>

      {error ? <ErrorText className="rounded-xl bg-red-50 p-3">{error}</ErrorText> : null}

      <ExpertEvaluationResultsPanel sessions={savedSessions} />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}
