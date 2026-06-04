"use client";

import { useMemo, useState } from "react";
import { evaluationItems } from "@/lib/demo-data";

type UploadResponse = {
  files: Array<{
    id: string;
    originalName: string;
    fileType: string;
    sizeBytes: number;
  }>;
  analysis: {
    provider: "demo" | "openai" | "gemini";
    mode: "demo" | "live";
    summary: string;
    documentSections: Array<{ label: string; confidence: number; summary: string }>;
    evaluationPreview: Array<{
      itemName: string;
      score: number;
      grade: string;
      rationale: string;
      recommendation: string;
      laws: string[];
      guidelines: string[];
    }>;
    warnings: string[];
  };
};

export default function UploadAnalyzer() {
  const [files, setFiles] = useState<File[]>([]);
  const [aiWeight, setAiWeight] = useState(30);
  const [itemPoints, setItemPoints] = useState<Record<string, number>>(
    Object.fromEntries(evaluationItems.map((item) => [item.id, item.points])),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<UploadResponse | null>(null);

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
    if (files.length === 0) {
      setError("먼저 파일을 선택해 주세요.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("provider", "auto");
    formData.append("aiWeight", String(aiWeight));
    formData.append("expertWeight", String(100 - aiWeight));
    formData.append("evaluationItemPoints", JSON.stringify(itemPoints));
    files.forEach((file) => formData.append("files", file));

    try {
      const response = await fetch("/api/uploads", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "업로드에 실패했습니다.");
      }

      setResult(payload);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "업로드에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-5 space-y-5 rounded-2xl border border-[#d7dee8] bg-[#f8fafc] p-4">
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
            {loading ? "분석 중..." : "업로드 분석"}
          </button>
        </div>
      </div>

      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p> : null}

      {result ? (
        <div className="space-y-4 rounded-xl bg-white p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">
              {result.analysis.provider.toUpperCase()}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              {result.analysis.mode === "live" ? "실제 AI API 분석" : "데모 분석"}
            </span>
            <span className="rounded-full bg-[#eef4fb] px-3 py-1 text-xs font-bold text-[#15345b]">
              적용 가중치 AI {aiWeight}% · 전문가 {100 - aiWeight}%
            </span>
            <span className="rounded-full bg-[#eef4fb] px-3 py-1 text-xs font-bold text-[#15345b]">
              총 배점 {totalPoints}점
            </span>
          </div>

          <p className="text-sm leading-6 text-[#475569]">{result.analysis.summary}</p>

          <div className="overflow-hidden rounded-xl border border-[#d7dee8]">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[#eef4fb] text-[#15345b]">
                <tr>
                  <th className="px-4 py-3">이번 업로드 파일</th>
                  <th className="px-4 py-3">형식</th>
                  <th className="px-4 py-3">크기</th>
                  <th className="px-4 py-3">분석상태</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d7dee8] bg-white">
                {result.files.map((file) => (
                  <tr key={file.id}>
                    <td className="px-4 py-4 font-semibold text-[#15345b]">{file.originalName}</td>
                    <td className="px-4 py-4 text-[#64748b]">{file.fileType}</td>
                    <td className="px-4 py-4 text-[#64748b]">{formatBytes(file.sizeBytes)}</td>
                    <td className="px-4 py-4">
                      <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">분석 완료</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.analysis.warnings.length > 0 ? (
            <div className="rounded-xl bg-[#fff7ed] p-3 text-sm leading-6 text-[#9a3412]">
              {result.analysis.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {result.analysis.documentSections.slice(0, 6).map((section) => (
              <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-3" key={section.label}>
                <div className="flex justify-between text-sm font-bold text-[#15345b]">
                  <span>{section.label}</span>
                  <span>{section.confidence}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
                  <div className="h-full rounded-full bg-[#2463b3]" style={{ width: `${section.confidence}%` }} />
                </div>
                <p className="mt-2 text-xs leading-5 text-[#64748b]">{section.summary}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {result.analysis.evaluationPreview.slice(0, 3).map((row) => (
              <div className="rounded-xl border border-[#d7dee8] p-3" key={row.itemName}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-[#15345b]">{row.itemName}</p>
                  <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">
                    {row.score}점 · {row.grade}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#475569]">{row.rationale}</p>
                <p className="mt-2 text-sm font-semibold leading-6 text-[#9a3412]">개선권고: {row.recommendation}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}
