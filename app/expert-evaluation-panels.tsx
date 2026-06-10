"use client";

import { useEffect, useMemo, useState } from "react";
import { evaluationItems } from "@/lib/demo-data";
import { formatUploadDateTime } from "@/lib/format-datetime";
import type { HumanEvaluationSession } from "@/lib/types";

type SessionWithRound = HumanEvaluationSession & { round: number };

export function ExpertEvaluationResultsPanel({ sessions }: { sessions: HumanEvaluationSession[] }) {
  const sortedSessions = useMemo<SessionWithRound[]>(() => {
    const ordered = [...sessions].sort(
      (left, right) => new Date(right.uploadedAt).getTime() - new Date(left.uploadedAt).getTime(),
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
      const timeout = window.setTimeout(() => setSelectedId(sortedSessions[0].id), 0);
      return () => window.clearTimeout(timeout);
    }
  }, [sortedSessions, selectedId]);

  if (sortedSessions.length === 0) return null;

  const selectedSession = sortedSessions.find((session) => session.id === selectedId) ?? sortedSessions[0];
  const avgScore =
    selectedSession.itemScores.length > 0
      ? Math.round(
          selectedSession.itemScores.reduce((sum, row) => sum + row.score, 0) /
            selectedSession.itemScores.length,
        )
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold text-[#15345b]">전문가 평가 결과</p>
          <p className="mt-1 text-sm text-[#64748b]">차수별로 업로드된 전문가 평가 자료와 점수를 확인합니다.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
          총 {sortedSessions.length}회
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-1">
        <div className="flex min-w-max gap-1">
          {sortedSessions.map((session) => {
            const isActive = session.id === selectedSession.id;
            return (
              <button
                key={session.id}
                type="button"
                className={`rounded-lg px-3 py-2 text-left transition sm:min-w-[148px] ${
                  isActive
                    ? "bg-white text-[#15345b] shadow-sm ring-1 ring-[#15345b]/20"
                    : "text-[#64748b] hover:bg-white/70 hover:text-[#15345b]"
                }`}
                onClick={() => setSelectedId(session.id)}
              >
                <span className="block text-sm font-bold">{session.round}차 평가</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-[#64748b]">
                  {formatUploadDateTime(session.uploadedAt)}
                </span>
                <span className="mt-1 block text-[11px] text-[#64748b]">
                  {session.reviewerName} · {session.files.length}개 파일
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <article className="space-y-4 rounded-xl border border-[#d7dee8] bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#15345b] px-3 py-1 text-xs font-bold text-white">
            {selectedSession.round}차 평가
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
            {formatUploadDateTime(selectedSession.uploadedAt)}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
            {selectedSession.reviewerName}
          </span>
          {avgScore !== null ? (
            <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">
              평균 {avgScore}점
            </span>
          ) : null}
        </div>

        {selectedSession.summary ? (
          <p className="text-sm leading-6 text-[#475569]">{selectedSession.summary}</p>
        ) : null}

        <details className="rounded-xl border border-[#d7dee8] bg-[#f8fafc]">
          <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[#15345b]">
            업로드 파일 ({selectedSession.files.length}건)
          </summary>
          <div className="overflow-hidden border-t border-[#d7dee8]">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[#eef4fb] text-[#15345b]">
                <tr>
                  <th className="px-4 py-3">파일명</th>
                  <th className="px-4 py-3">형식</th>
                  <th className="px-4 py-3">크기</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d7dee8] bg-white">
                {selectedSession.files.map((file) => (
                  <tr key={file.id}>
                    <td className="px-4 py-4 font-semibold text-[#15345b]">{file.originalName}</td>
                    <td className="px-4 py-4 text-[#64748b]">{file.fileType}</td>
                    <td className="px-4 py-4 text-[#64748b]">{formatBytes(file.sizeBytes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <details className="rounded-xl border border-[#d7dee8] bg-white" open>
          <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-[#15345b]">
            항목별 점수 ({selectedSession.itemScores.length}건)
          </summary>
          <div className="space-y-3 border-t border-[#d7dee8] p-4">
            {selectedSession.itemScores.map((row) => {
              const item = evaluationItems.find((entry) => entry.id === row.itemId);
              return (
                <div className="rounded-xl border border-[#d7dee8] p-3" key={row.itemId}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-[#15345b]">{item?.detailItem ?? row.itemId}</p>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                      {row.score}점
                    </span>
                  </div>
                  {row.comment ? (
                    <p className="mt-2 text-sm leading-6 text-[#475569]">{row.comment}</p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </details>
      </article>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round((bytes / 1024 / 1024) * 10) / 10} MB`;
}
