"use client";

import { useEffect, useMemo, useState } from "react";
import { formatProviderBadgeLabel } from "@/lib/ai/provider-labels";
import { formatUploadDateTime } from "@/lib/format-datetime";
import type { UploadAnalysisSession } from "@/lib/types";

type SessionWithRound = UploadAnalysisSession & { round: number };

export function UploadAnalysisResultsPanel({ sessions }: { sessions: UploadAnalysisSession[] }) {
  const sortedSessions = useMemo<SessionWithRound[]>(() => {
    const ordered = [...sessions].sort(
      (left, right) => new Date(right.analyzedAt).getTime() - new Date(left.analyzedAt).getTime(),
    );
    const total = ordered.length;
    return ordered.map((session, index) => ({
      ...session,
      round: total - index,
    }));
  }, [sessions]);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (sortedSessions.length === 0) return;
    const stillExists = sortedSessions.some((session) => session.id === selectedId);
    if (!selectedId || !stillExists) {
      setSelectedId(sortedSessions[0].id);
    }
  }, [sortedSessions, selectedId]);

  if (sortedSessions.length === 0) return null;

  const selectedSession = sortedSessions.find((session) => session.id === selectedId) ?? sortedSessions[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold text-[#15345b]">분석 결과</p>
          <p className="mt-1 text-sm text-[#64748b]">
            차수별로 결과를 선택해 확인합니다. 최신 분석이 기본으로 표시됩니다.
          </p>
        </div>
        <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">
          총 {sortedSessions.length}회
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-1">
        <div className="flex min-w-max gap-1">
          {sortedSessions.map((session) => {
            const isActive = session.id === selectedSession.id;
            const fileCount = session.files.length;
            return (
              <button
                key={session.id}
                type="button"
                className={`rounded-lg px-3 py-2 text-left transition sm:min-w-[148px] ${
                  isActive
                    ? "bg-white text-[#15345b] shadow-sm ring-1 ring-[#2463b3]/20"
                    : "text-[#64748b] hover:bg-white/70 hover:text-[#15345b]"
                }`}
                onClick={() => setSelectedId(session.id)}
              >
                <span className="block text-sm font-bold">{session.round}차 분석</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-[#64748b]">
                  {formatUploadDateTime(session.analyzedAt)}
                </span>
                <span className="mt-1 block text-[11px] text-[#64748b]">
                  {fileCount}개 파일 · {formatProviderBadgeLabel(session.analysis.provider)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <AnalysisSessionDetail session={selectedSession} />
    </div>
  );
}

function AnalysisSessionDetail({ session }: { session: SessionWithRound }) {
  const avgScore =
    session.analysis.evaluationPreview.length > 0
      ? Math.round(
          session.analysis.evaluationPreview.reduce((sum, row) => sum + row.score, 0) /
            session.analysis.evaluationPreview.length,
        )
      : null;

  return (
    <article className="space-y-4 rounded-xl border border-[#d7dee8] bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[#15345b] px-3 py-1 text-xs font-bold text-white">
          {session.round}차 분석
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
          {formatUploadDateTime(session.analyzedAt)}
        </span>
        <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">
          {formatProviderBadgeLabel(session.analysis.provider)}
        </span>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
          {session.analysis.mode === "live" ? "실제 AI API 분석" : "데모 분석"}
        </span>
        <span className="rounded-full bg-[#eef4fb] px-3 py-1 text-xs font-bold text-[#15345b]">
          AI {session.aiWeight}% · 전문가 {session.expertWeight}%
        </span>
        <span className="rounded-full bg-[#eef4fb] px-3 py-1 text-xs font-bold text-[#15345b]">
          총 배점 {session.totalPoints}점
        </span>
        {avgScore !== null ? (
          <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">
            평균 {avgScore}점
          </span>
        ) : null}
      </div>

      <p className="text-sm leading-6 text-[#475569]">{session.analysis.summary}</p>

      {session.analysis.spatialContext || (session.analysis.referenceLaws?.length ?? 0) > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {session.analysis.spatialContext ? (
            <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-3 text-sm">
              <p className="font-bold text-[#15345b]">경관지구 (브이월드)</p>
              <p className="mt-1 text-[#64748b]">{session.analysis.spatialContext.address}</p>
              <p className="mt-2 font-semibold text-[#15345b]">
                {session.analysis.spatialContext.inLandscapeZone ? "경관지구 해당 가능" : "인근 조회 결과 없음"}
              </p>
              {session.analysis.spatialContext.matchedZones.slice(0, 2).map((zone) => (
                <p className="mt-1 text-xs text-[#64748b]" key={`${session.id}-${zone.code}`}>
                  {zone.name} · {zone.jurisdiction}
                </p>
              ))}
            </div>
          ) : null}
          {(session.analysis.referenceLaws?.length ?? 0) > 0 ? (
            <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-3 text-sm">
              <p className="font-bold text-[#15345b]">
                실시간 법령 근거 ({session.analysis.lawSource === "law.go.kr" ? "국가법령정보" : "내장 요약"})
              </p>
              {session.analysis.referenceLaws?.slice(0, 3).map((law) => (
                <div className="mt-2 text-[#64748b]" key={`${session.id}-${law.title}-${law.article}`}>
                  <a
                    className="font-semibold text-[#2463b3] underline decoration-[#2463b3]/40 underline-offset-2 hover:text-[#15345b]"
                    href={law.sourceUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {law.title} {law.article}
                  </a>
                  <p className="mt-0.5 text-xs leading-5">{law.summary}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <details className="rounded-xl border border-[#d7dee8] bg-[#f8fafc]">
        <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[#15345b]">
          업로드 파일 ({session.files.length}건)
        </summary>
        <div className="overflow-hidden border-t border-[#d7dee8]">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-[#eef4fb] text-[#15345b]">
              <tr>
                <th className="px-4 py-3">파일명</th>
                <th className="px-4 py-3">형식</th>
                <th className="px-4 py-3">크기</th>
                <th className="px-4 py-3">분석상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d7dee8] bg-white">
              {session.files.map((file) => (
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
      </details>

      {session.analysis.warnings.length > 0 ? (
        <div className="rounded-xl border border-[#fdba74] bg-[#fff7ed] p-4 text-sm leading-6 text-[#9a3412]">
          <p className="font-bold">AI 호출 안내</p>
          {session.analysis.warnings.map((warning) => (
            <p className="mt-2" key={warning}>
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      <details className="rounded-xl border border-[#d7dee8] bg-white" open>
        <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[#15345b]">
          문서 섹션 분석 ({session.analysis.documentSections.length}건)
        </summary>
        <div className="grid gap-3 border-t border-[#d7dee8] p-4 md:grid-cols-2 xl:grid-cols-3">
          {session.analysis.documentSections.map((section) => (
            <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-3" key={`${session.id}-${section.label}`}>
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
      </details>

      <details className="rounded-xl border border-[#d7dee8] bg-white" open>
        <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[#15345b]">
          평가 항목 ({session.analysis.evaluationPreview.length}건)
        </summary>
        <div className="space-y-3 border-t border-[#d7dee8] p-4">
          {session.analysis.evaluationPreview.map((row) => (
            <div className="rounded-xl border border-[#d7dee8] p-3" key={`${session.id}-${row.itemName}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold text-[#15345b]">{row.itemName}</p>
                <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">
                  {row.score}점 · {row.grade}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#475569]">{row.rationale}</p>
              {row.laws.length > 0 ? (
                <p className="mt-2 text-xs leading-5 text-[#64748b]">법령 근거: {row.laws.join(" · ")}</p>
              ) : null}
              <p className="mt-2 text-sm font-semibold leading-6 text-[#9a3412]">개선권고: {row.recommendation}</p>
            </div>
          ))}
        </div>
      </details>
    </article>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}
