"use client";

import { EvaluationTextBlock } from "@/components/evaluation-text-block";
import { prepareEvaluationDisplay } from "@/lib/evaluation-display";
import { formatDocumentSectionText } from "@/lib/format-document-section-text";
import { formatEvaluationText } from "@/lib/format-evaluation-text";
import type { ChecklistReviewRow } from "@/lib/pre-review/types";
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
  const sectionByItemId = new Map(
    documentSections
      .filter((section) => section.itemId)
      .map((section) => [section.itemId!, section]),
  );
  const statusByItemId = new Map(checklistRows.map((row) => [row.itemId, row]));

  return (
    <div className="space-y-3">
      {results.map((result, index) => {
        const preview =
          evaluationPreview.find((row) => row.itemId === result.item.id) ??
          evaluationPreview.find((row) => row.itemName === result.item.detailItem);
        const documentSection =
          sectionByItemId.get(result.item.id) ??
          documentSections.find((section) => section.label === result.item.detailItem);
        const checklistRow = statusByItemId.get(result.item.id);
        const aiDisplay = prepareEvaluationDisplay(
          result.aiEvaluation.rationale,
          result.aiEvaluation.recommendation,
          fileSummaries,
          result.item,
        );
        const expertText = formatEvaluationText(result.humanEvaluation.comment ?? "");

        return (
          <article className="overflow-hidden rounded-xl border border-[#d7dee8] bg-white" key={result.item.id}>
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e8eef5] bg-[#f8fafc] px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-[#64748b]">#{index + 1}</span>
                  <p className="text-sm font-bold text-[#15345b]">{result.item.detailItem}</p>
                  <ChecklistStatusBadge status={checklistRow?.status ?? "확인필요"} />
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-[#64748b]">
                    배점 {result.item.points}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] font-semibold text-[#64748b]">
                  {result.item.majorCategory} · {result.item.middleCategory}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 text-center">
                <ScorePill label="AI" score={result.aiEvaluation.score} tone="ai" />
                <ScorePill
                  label="전문가"
                  score={expertWeight > 0 ? result.humanEvaluation.score : null}
                  tone="expert"
                />
              </div>
            </div>

            <div className="grid gap-0 lg:grid-cols-2 lg:divide-x lg:divide-[#e8eef5]">
              {documentSection ? (
                <section className="border-b border-[#e8eef5] px-4 py-3 lg:border-b-0">
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
              ) : null}

              <section className={`px-4 py-3 ${documentSection ? "" : "lg:col-span-2"}`}>
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
                    <p className="text-[#64748b]">자동 검토 포인트가 없습니다.</p>
                  )}
                  {expertText ? (
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
          </article>
        );
      })}
    </div>
  );
}

function ChecklistStatusBadge({ status }: { status: ChecklistReviewRow["status"] }) {
  const className =
    status === "미흡"
      ? "bg-red-100 text-red-800"
      : status === "확인필요"
        ? "bg-amber-100 text-amber-900"
        : "bg-emerald-100 text-emerald-800";

  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${className}`}>{status}</span>;
}

function ScorePill({
  label,
  score,
  tone,
}: {
  label: string;
  score: number | null;
  tone: "ai" | "expert";
}) {
  return (
    <div className="min-w-[64px] rounded-lg border border-[#d7dee8] bg-white px-3 py-1.5">
      <p className="text-[10px] font-semibold text-[#64748b]">{label}</p>
      <p className={`text-base font-bold ${tone === "ai" ? "text-[#2463b3]" : "text-[#15345b]"}`}>
        {score === null ? "-" : score}
      </p>
    </div>
  );
}
