"use client";

import { useEffect, useMemo, useState } from "react";
import { formatProviderBadgeLabel } from "@/lib/ai/provider-labels";
import { formatUploadDateTime } from "@/lib/format-datetime";
import ReferenceLinkTitle from "@/components/reference-link-title";
import { buildLawReferenceUrl } from "@/lib/reference-links";
import type { EvaluationRound } from "@/lib/types";

type RoundWithNumber = EvaluationRound & { roundNumber: number };

export default function UnifiedEvaluationResults({ rounds }: { rounds: EvaluationRound[] }) {
  const sortedRounds = useMemo<RoundWithNumber[]>(() => {
    const ordered = [...rounds].sort(
      (a, b) => new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime(),
    );
    return ordered.map((round, index) => ({
      ...round,
      roundNumber: ordered.length - index,
    }));
  }, [rounds]);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (sortedRounds.length === 0) return;
    const exists = sortedRounds.some((round) => round.id === selectedId);
    if (!selectedId || !exists) {
      const timeout = window.setTimeout(() => setSelectedId(sortedRounds[0].id), 0);
      return () => window.clearTimeout(timeout);
    }
  }, [sortedRounds, selectedId]);

  if (sortedRounds.length === 0) return null;

  const selected = sortedRounds.find((round) => round.id === selectedId) ?? sortedRounds[0];
  const aiAvg =
    selected.aiAnalysis.evaluationPreview.length > 0
      ? Math.round(
          selected.aiAnalysis.evaluationPreview.reduce((sum, row) => sum + row.score, 0) /
            selected.aiAnalysis.evaluationPreview.length,
        )
      : null;
  const expertAvg =
    selected.expertItemScores.length > 0
      ? Math.round(
          selected.expertItemScores.reduce((sum, row) => sum + row.score, 0) /
            selected.expertItemScores.length,
        )
      : null;

  return (
    <div className="space-y-4 rounded-2xl border border-[#d7dee8] bg-[#f8fafc] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-bold text-[#15345b]">평가 분석 히스토리</p>
          <p className="mt-1 text-sm text-[#64748b]">
            AI·전문가 자료를 함께 분석한 차수별 통합 결과입니다.
          </p>
        </div>
        <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">
          총 {sortedRounds.length}차
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#d7dee8] bg-white p-1">
        <div className="flex min-w-max gap-1">
          {sortedRounds.map((round) => {
            const active = round.id === selected.id;
            return (
              <button
                key={round.id}
                type="button"
                className={`rounded-lg px-3 py-2 text-left transition sm:min-w-[160px] ${
                  active
                    ? "bg-[#eef4fb] text-[#15345b] shadow-sm ring-1 ring-[#2463b3]/25"
                    : "text-[#64748b] hover:bg-[#f8fafc] hover:text-[#15345b]"
                }`}
                onClick={() => setSelectedId(round.id)}
              >
                <span className="block text-sm font-bold">{round.roundNumber}차 평가</span>
                <span className="mt-0.5 block text-[11px] text-[#64748b]">
                  {formatUploadDateTime(round.evaluatedAt)}
                </span>
                <span className="mt-1 block text-[11px] text-[#64748b]">
                  AI {round.aiFiles.length} · 전문가 {round.expertFiles.length}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <article className="space-y-4 rounded-xl border border-[#d7dee8] bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[#15345b] px-3 py-1 text-xs font-bold text-white">
            {selected.roundNumber}차
          </span>
          <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">
            AI {selected.aiWeight}% · 전문가 {selected.expertWeight}%
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
            {selected.reviewerName}
          </span>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
            총 배점 {selected.totalPoints}점
          </span>
          {aiAvg !== null ? (
            <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">
              AI 평균 {aiAvg}점
            </span>
          ) : null}
          {expertAvg !== null ? (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
              전문가 평균 {expertAvg}점
            </span>
          ) : null}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <FileList title="AI 평가 자료" files={selected.aiFiles} tone="ai" />
          <FileList title="전문가 평가 자료" files={selected.expertFiles} tone="expert" />
        </div>

        {selected.expertSummary ? (
          <p className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-[#475569]">{selected.expertSummary}</p>
        ) : null}

        <p className="text-sm leading-6 text-[#475569]">{selected.aiAnalysis.summary}</p>

        <div className="grid gap-3 lg:grid-cols-2">
          {selected.aiAnalysis.evaluationPreview.map((row) => {
            const item = selected.evaluationItems.find(
              (entry) => entry.id === row.itemId || entry.detailItem === row.itemName,
            );
            const expert = selected.expertItemScores.find((score) => score.itemId === item?.id);
            return (
              <div className="rounded-xl border border-[#d7dee8] p-3" key={`${selected.id}-${row.itemName}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-[#15345b]">{row.itemName}</p>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-[#e8f1ff] px-2.5 py-1 text-[11px] font-bold text-[#2463b3]">
                      AI {row.score}점
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                      전문가 {expert?.score ?? "-"}점
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#475569]">{row.rationale}</p>
                {expert?.comment ? (
                  <p className="mt-2 text-xs leading-5 text-[#64748b]">전문가 의견: {expert.comment}</p>
                ) : null}
              </div>
            );
          })}
        </div>

        {(selected.aiAnalysis.referenceLaws?.length ?? 0) > 0 ? (
          <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-3 text-sm">
            <p className="font-bold text-[#15345b]">법령 근거</p>
            {selected.aiAnalysis.referenceLaws
              ?.filter((law) => buildLawReferenceUrl(law.title, law.sourceUrl) !== null)
              .slice(0, 3)
              .map((law) => (
                <div className="mt-2 text-[#64748b]" key={`${selected.id}-${law.title}`}>
                  <ReferenceLinkTitle
                    title={`${law.title} ${law.article}`}
                    href={buildLawReferenceUrl(law.title, law.sourceUrl)}
                  />
                </div>
              ))}
          </div>
        ) : null}

        <p className="text-xs text-[#64748b]">
          AI 엔진: {formatProviderBadgeLabel(selected.aiAnalysis.provider)} ·{" "}
          {selected.aiAnalysis.mode === "live" ? "실제 API 분석" : "데모 분석"}
        </p>
      </article>
    </div>
  );
}

function FileList({
  title,
  files,
  tone,
}: {
  title: string;
  files: EvaluationRound["aiFiles"];
  tone: "ai" | "expert";
}) {
  const headerClass = tone === "ai" ? "text-[#2463b3]" : "text-[#15345b]";
  return (
    <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-3">
      <p className={`text-sm font-bold ${headerClass}`}>
        {title} ({files.length})
      </p>
      <ul className="mt-2 space-y-1 text-xs text-[#64748b]">
        {files.map((file) => (
          <li key={file.id}>
            {file.originalName} · {file.fileType}
          </li>
        ))}
      </ul>
    </div>
  );
}
