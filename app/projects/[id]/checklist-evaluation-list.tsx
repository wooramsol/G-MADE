"use client";

import { useMemo, useState } from "react";
import { EvaluationTextBlock } from "@/components/evaluation-text-block";
import { prepareEvaluationDisplay } from "@/lib/evaluation-display";
import { formatDocumentSectionText } from "@/lib/format-document-section-text";
import { formatEvaluationText } from "@/lib/format-evaluation-text";
import {
  groupChecklistRowsByChapter,
  summarizeChecklistRows,
} from "@/lib/pre-review/derive-checklist-status";
import type { ChecklistDisplayStatus, ChecklistReviewRow } from "@/lib/pre-review/types";
import { buildPageCitationSummaries } from "@/lib/upload-to-hybrid";
import type { EvaluationRound, HybridResult } from "@/lib/types";

type Props = {
  results: HybridResult[];
  documentSections: EvaluationRound["aiAnalysis"]["documentSections"];
  evaluationPreview: EvaluationRound["aiAnalysis"]["evaluationPreview"];
  fileSummaries: ReturnType<typeof buildPageCitationSummaries>;
  expertWeight: number;
  checklistRows: ChecklistReviewRow[];
};

export default function ChecklistEvaluationList({
  results,
  documentSections,
  evaluationPreview,
  fileSummaries,
  expertWeight,
  checklistRows,
}: Props) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const summary = useMemo(() => summarizeChecklistRows(checklistRows), [checklistRows]);
  const chapters = useMemo(() => groupChecklistRowsByChapter(checklistRows), [checklistRows]);

  const resultByItemId = useMemo(
    () => new Map(results.map((result) => [result.item.id, result])),
    [results],
  );
  const sectionByItemId = useMemo(
    () =>
      new Map(
        documentSections
          .filter((section) => section.itemId)
          .map((section) => [section.itemId!, section]),
      ),
    [documentSections],
  );
  const rowByItemId = useMemo(
    () => new Map(checklistRows.map((row) => [row.itemId, row])),
    [checklistRows],
  );

  const toggleExpanded = (itemId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  let itemIndex = 0;

  return (
    <div className="space-y-4">
      <ChecklistProgressHeader summary={summary} />

      {chapters.map(({ chapter, rows }) => (
        <section className="overflow-hidden rounded-xl border border-[#d7dee8]" key={chapter}>
          <div className="bg-[#15345b] px-4 py-2.5">
            <p className="text-sm font-bold text-white">{chapter}</p>
            <p className="text-[11px] text-white/70">
              {rows.filter((row) => row.displayStatus === "반영").length}/{rows.length} 반영
            </p>
          </div>

          <ul className="divide-y divide-[#e8eef5]">
            {rows.map((row) => {
              itemIndex += 1;
              const result = resultByItemId.get(row.itemId);
              const expanded = expandedIds.has(row.itemId);
              const preview =
                evaluationPreview.find((entry) => entry.itemId === row.itemId) ??
                evaluationPreview.find((entry) => entry.itemName === row.itemName);
              const documentSection =
                sectionByItemId.get(row.itemId) ??
                documentSections.find((section) => section.label === row.itemName);

              return (
                <li key={row.itemId}>
                  <button
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-[#f8fafc]"
                    onClick={() => toggleExpanded(row.itemId)}
                    type="button"
                  >
                    <span className="mt-0.5 w-8 shrink-0 text-xs font-bold text-[#64748b]">
                      {String(itemIndex).padStart(3, "0")}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-[#15345b]">{row.itemName}</p>
                        {row.points > 0 ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-[#64748b]">
                            배점 {row.points}
                          </span>
                        ) : null}
                        {row.issueCount > 0 ? (
                          <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                            이슈 {row.issueCount}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[11px] text-[#64748b]">{row.middleCategory}</p>
                      {row.rationalePreview && !expanded ? (
                        <p className="mt-1 line-clamp-1 text-xs text-[#475569]">{row.rationalePreview}</p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <DisplayStatusBadge status={rowByItemId.get(row.itemId)?.displayStatus ?? row.displayStatus} />
                      {result ? (
                        <div className="flex gap-1.5 text-center">
                          <MiniScore label="AI" score={result.aiEvaluation.score} />
                          {expertWeight > 0 ? (
                            <MiniScore label="전문가" score={result.humanEvaluation.score} />
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </button>

                  {expanded && result ? (
                    <ChecklistItemDetail
                      documentSection={documentSection}
                      expertText={formatEvaluationText(result.humanEvaluation.comment ?? "")}
                      expertWeight={expertWeight}
                      fileSummaries={fileSummaries}
                      item={result.item}
                      preview={preview}
                      result={result}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function ChecklistProgressHeader({
  summary,
}: {
  summary: ReturnType<typeof summarizeChecklistRows>;
}) {
  const checked = summary.reflected + summary.notReflected + summary.notApplicable;

  return (
    <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-[#15345b]">체크리스트 진행률</p>
        <p className="text-sm font-bold text-[#2463b3]">
          {checked} / {summary.total} ({summary.progressPercent}%)
        </p>
      </div>

      <div className="mb-4 h-2 overflow-hidden rounded-full bg-[#e2e8f0]">
        <div
          className="h-full rounded-full bg-[#2463b3] transition-all"
          style={{ width: `${summary.progressPercent}%` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCard label="반영" tone="green" value={summary.reflected} />
        <StatCard label="미반영" tone="red" value={summary.notReflected} />
        <StatCard label="검토필요" tone="amber" value={summary.reviewNeeded} />
        <StatCard label="해당없음" tone="gray" value={summary.notApplicable} />
      </div>

      <p className="mt-3 text-[11px] leading-5 text-[#64748b]">
        AI가 도서·평가항목을 분석해 반영 여부를 자동 표시합니다. 세종시 자가점검(반영/미반영/해당없음) 형식이며,
        담당자 최종 확인이 필요합니다.
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "green" | "red" | "amber" | "gray";
}) {
  const toneClass =
    tone === "green"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "red"
        ? "border-red-200 bg-red-50 text-red-800"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-slate-200 bg-white text-[#64748b]";

  return (
    <div className={`rounded-lg border px-3 py-2 text-center ${toneClass}`}>
      <p className="text-[10px] font-semibold opacity-80">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}

function DisplayStatusBadge({ status }: { status: ChecklistDisplayStatus }) {
  const className =
    status === "반영"
      ? "bg-emerald-600 text-white"
      : status === "미반영"
        ? "bg-red-600 text-white"
        : status === "검토필요"
          ? "bg-amber-500 text-white"
          : "bg-slate-400 text-white";

  return (
    <span className={`rounded-md px-2.5 py-1 text-[11px] font-bold ${className}`}>{status}</span>
  );
}

function MiniScore({ label, score }: { label: string; score: number }) {
  return (
    <div className="min-w-[44px] rounded border border-[#d7dee8] bg-white px-2 py-1">
      <p className="text-[9px] font-semibold text-[#64748b]">{label}</p>
      <p className="text-xs font-bold text-[#15345b]">{score}</p>
    </div>
  );
}

function ChecklistItemDetail({
  result,
  item,
  preview,
  documentSection,
  fileSummaries,
  expertText,
  expertWeight,
}: {
  result: HybridResult;
  item: HybridResult["item"];
  preview: EvaluationRound["aiAnalysis"]["evaluationPreview"][number] | undefined;
  documentSection: EvaluationRound["aiAnalysis"]["documentSections"][number] | undefined;
  fileSummaries: ReturnType<typeof buildPageCitationSummaries>;
  expertText: string;
  expertWeight: number;
}) {
  const aiDisplay = prepareEvaluationDisplay(
    result.aiEvaluation.rationale,
    result.aiEvaluation.recommendation,
    fileSummaries,
    item,
  );

  return (
    <div className="border-t border-[#e8eef5] bg-white px-4 pb-4 pt-2">
      <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-[#e8eef5]">
        {documentSection ? (
          <section className="border-b border-[#e8eef5] py-3 lg:border-b-0 lg:pr-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-[#15345b]">근거 자료</p>
              <span className="rounded-full bg-[#e8f1ff] px-2 py-0.5 text-[10px] font-bold text-[#2463b3]">
                문서이해도 {documentSection.confidence}%
              </span>
            </div>
            <p className="whitespace-pre-wrap text-xs leading-5 text-[#64748b]">
              {formatDocumentSectionText(documentSection.summary)}
            </p>
          </section>
        ) : (
          <section className="border-b border-[#e8eef5] py-3 lg:border-b-0 lg:pr-4">
            <p className="text-xs text-[#64748b]">연결된 도서 섹션을 찾지 못했습니다.</p>
          </section>
        )}

        <section className={`py-3 ${documentSection ? "lg:pl-4" : ""}`}>
          <div className="space-y-2 text-xs leading-5 text-[#64748b]">
            {aiDisplay.points.length > 0 ? (
              <div>
                <p className="font-bold text-[#15345b]">검토 결과</p>
                <div className="mt-1">
                  <p className="mb-1 font-semibold text-[#2463b3]">AI</p>
                  <EvaluationTextBlock display={aiDisplay} />
                </div>
              </div>
            ) : (
              <p>자동 검토 포인트가 없습니다.</p>
            )}
            {expertWeight > 0 && expertText ? (
              <div>
                <p className="font-semibold text-[#15345b]">전문가</p>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-[#475569]">{expertText}</p>
              </div>
            ) : null}
            {preview?.recommendation ? (
              <div className="border-t border-[#e2e8f0] pt-2">
                <p className="font-bold text-[#15345b]">보완 요청</p>
                <p className="mt-1 whitespace-pre-wrap text-[#475569]">
                  {formatEvaluationText(preview.recommendation)}
                </p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
