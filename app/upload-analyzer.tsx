"use client";

import { useMemo, useState } from "react";
import { evaluationItems } from "@/lib/demo-data";
import type { AiProviderPreference } from "@/lib/ai/types";
import type { ProjectFile, UploadAnalysisSession } from "@/lib/types";
import { UploadAnalysisResultsPanel } from "./upload-panels";
import { showToast } from "./toast";

type UploadApiResponse = {
  files: Array<{
    id: string;
    originalName: string;
    fileType: string;
    sizeBytes: number;
  }>;
  session: UploadAnalysisSession;
};

type UploadAnalyzerProps = {
  projectId?: string;
  savedAnalyses?: UploadAnalysisSession[];
  onUploadedFiles?: (files: ProjectFile[]) => void;
  onAnalysisSaved?: (session: UploadAnalysisSession, files: ProjectFile[]) => void;
};

export default function UploadAnalyzer({
  projectId,
  savedAnalyses = [],
  onUploadedFiles,
  onAnalysisSaved,
}: UploadAnalyzerProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [aiWeight, setAiWeight] = useState(30);
  const [itemPoints, setItemPoints] = useState<Record<string, number>>(
    Object.fromEntries(evaluationItems.map((item) => [item.id, item.points])),
  );
  const [provider, setProvider] = useState<AiProviderPreference>("gemini");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const totalSize = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files],
  );

  const totalPoints = useMemo(
    () => Object.values(itemPoints).reduce((sum, points) => sum + Number(points || 0), 0),
    [itemPoints],
  );

  function updateItemPoint(itemId: string, value: string) {
    setItemPoints((current) => ({
      ...current,
      [itemId]: Math.max(0, Number(value) || 0),
    }));
  }

  async function submitUpload() {
    if (loading) return;

    if (files.length === 0) {
      setError("먼저 파일을 선택해 주세요.");
      return;
    }

    setLoading(true);
    setError("");

    const formData = new FormData();
    if (projectId) {
      formData.append("projectId", projectId);
    }
    formData.append("provider", provider);
    formData.append("aiWeight", String(aiWeight));
    formData.append("expertWeight", String(100 - aiWeight));
    formData.append("evaluationItemPoints", JSON.stringify(itemPoints));
    files.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as UploadApiResponse & { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "업로드에 실패했습니다.");
      }

      const uploadedAt = payload.session.analyzedAt;
      const projectFiles: ProjectFile[] = payload.files.map((file) => ({
        id: file.id,
        fileName: file.originalName,
        fileType: formatStoredFileType(file.originalName, file.fileType),
        analysisStatus: "완료",
        uploadedAt,
        sizeBytes: file.sizeBytes,
      }));

      setFiles([]);
      showToast({ message: "AI 분석이 완료되었습니다.", tone: "success" });

      if (onUploadedFiles) {
        onUploadedFiles(projectFiles);
      }
      if (onAnalysisSaved) {
        onAnalysisSaved(payload.session, projectFiles);
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "업로드에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-5 space-y-5 rounded-2xl border border-[#d7dee8] bg-[#f8fafc] p-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-[#d7dee8] bg-white px-4 py-3">
        <div>
          <p className="text-sm font-bold text-[#15345b]">분석 AI 선택</p>
          <p className="mt-1 text-xs text-[#64748b]">
            기본값은 Gemini입니다. Claude는 CLAUDE_API_KEY, ChatGPT는 OPENAI_API_KEY가 필요합니다.
          </p>
        </div>
        <label className="text-sm">
          <span className="mb-2 block font-bold text-[#15345b]">AI 엔진</span>
          <select
            className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-2 font-semibold text-[#15345b] outline-none focus:border-[#2463b3] focus:bg-white"
            value={provider}
            onChange={(event) => setProvider(event.target.value as AiProviderPreference)}
          >
            <option value="gemini">Gemini (기본)</option>
            <option value="openai">ChatGPT</option>
            <option value="claude">Claude</option>
          </select>
        </label>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <label className="flex min-h-56 cursor-pointer flex-col rounded-xl border border-dashed border-[#2463b3] bg-white p-4 text-sm text-[#475569]">
          <span className="font-bold text-[#15345b]">1. 파일 선택</span>
          <span className="mt-1 leading-6">PDF, DOCX, PPTX, JPG, PNG, DWG, ZIP 파일을 업로드할 수 있습니다.</span>
          <input
            className="mt-4 text-sm"
            multiple
            type="file"
            accept=".pdf,.docx,.pptx,.jpg,.jpeg,.png,.dwg,.zip,.txt,.md"
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
          />
          {files.length > 0 ? (
            <div className="mt-4 rounded-xl bg-[#f8fafc] p-3 text-sm text-[#475569]">
              <p className="font-semibold text-[#15345b]">선택된 파일 {files.length}개 · {formatBytes(totalSize)}</p>
              <ul className="mt-2 space-y-1">
                {files.map((file) => (
                  <li key={`${file.name}-${file.size}`}>- {file.name} ({formatBytes(file.size)})</li>
                ))}
              </ul>
            </div>
          ) : null}
        </label>

        <div className="min-h-56 rounded-xl border border-[#d7dee8] bg-white p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="font-bold text-[#15345b]">2. 평가 가중치 조정</span>
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
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-[#e8f1ff] p-3">
              <p className="text-xs font-bold text-[#2463b3]">AI 평가</p>
              <p className="mt-1 text-xl font-black text-[#15345b]">{aiWeight}%</p>
            </div>
            <div className="rounded-lg bg-slate-100 p-3">
              <p className="text-xs font-bold text-slate-600">전문가 평가</p>
              <p className="mt-1 text-xl font-black text-[#15345b]">{100 - aiWeight}%</p>
            </div>
          </div>
          <p className="mt-3 rounded-xl bg-[#f8fafc] p-3 text-xs leading-5 text-[#64748b]">
            최종점수 산정 전에 프로젝트 성격에 맞게 AI와 전문가 평가 비율을 조정합니다.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-[#d7dee8] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold text-[#15345b]">3. 평가항목 배점 수정</p>
            <p className="mt-1 text-sm text-[#64748b]">업로드 자료 분석 전에 항목별 배점을 조정합니다. 현재 총 배점 {totalPoints}점</p>
          </div>
          <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">DB 기반 평가항목</span>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-[#d7dee8]">
          <table className="w-full min-w-[980px] border-collapse text-left text-sm">
            <thead className="bg-[#eef4fb] text-[#15345b]">
              <tr>
                <th className="px-4 py-3">대분류</th>
                <th className="px-4 py-3">중분류</th>
                <th className="px-4 py-3">세부항목</th>
                <th className="w-28 px-4 py-3">배점</th>
                <th className="px-4 py-3">평가기준</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d7dee8] bg-white">
              {evaluationItems.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-4 font-semibold text-[#15345b]">{item.majorCategory}</td>
                  <td className="px-4 py-4 text-[#475569]">{item.middleCategory}</td>
                  <td className="px-4 py-4 font-semibold text-[#172033]">{item.detailItem}</td>
                  <td className="px-4 py-4">
                    <input
                      aria-label={`${item.detailItem} 배점`}
                      className="w-20 rounded-lg border border-[#d7dee8] bg-[#f8fafc] px-3 py-2 text-sm font-bold text-[#15345b] outline-none focus:border-[#2463b3] focus:bg-white"
                      min="0"
                      type="number"
                      value={itemPoints[item.id] ?? item.points}
                      onChange={(event) => updateItemPoint(item.id, event.target.value)}
                    />
                  </td>
                  <td className="px-4 py-4 leading-6 text-[#64748b]">{item.criteria}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-[#d7dee8] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold text-[#15345b]">4. AI 자동 분석 실행</p>
            <p className="mt-1 text-sm text-[#64748b]">파일, 가중치, 배점 설정을 확인한 뒤 분석을 실행합니다.</p>
          </div>
          <button
            className="primary-action rounded-xl px-5 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={loading}
            type="button"
            onClick={submitUpload}
          >
            {loading ? "AI 분석 중 (최대 20초)..." : "업로드 분석"}
          </button>
        </div>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}

      <UploadAnalysisResultsPanel sessions={savedAnalyses} />
    </div>
  );
}

function formatStoredFileType(fileName: string, fallbackType: string): string {
  const extension = fileName.split(".").pop()?.toUpperCase();
  return extension || fallbackType;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}
