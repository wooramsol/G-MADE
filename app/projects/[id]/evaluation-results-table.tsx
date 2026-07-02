"use client";

import { memo } from "react";
import { ScoreValue } from "@/components/typography";
import ReferenceLinkTitle from "@/components/reference-link-title";
import { lawMatchesCitation } from "@/lib/related-reference-laws";
import { guidelineMatchesCitation } from "@/lib/related-reference-guidelines";
import { buildAdmrulReferenceUrl, buildLawReferenceUrl } from "@/lib/reference-links";
import type { EvaluationRound, HybridResult } from "@/lib/types";

type EvaluationPreview = EvaluationRound["aiAnalysis"]["evaluationPreview"];
type ReferenceLaws = NonNullable<EvaluationRound["aiAnalysis"]["referenceLaws"]>;
type ReferenceGuidelines = NonNullable<EvaluationRound["aiAnalysis"]["referenceGuidelines"]>;

export default function EvaluationResultsTable({
  results,
  evaluationPreview,
  referenceLaws,
  referenceGuidelines,
  roundId,
}: {
  results: HybridResult[];
  evaluationPreview: EvaluationPreview;
  referenceLaws: ReferenceLaws;
  referenceGuidelines: ReferenceGuidelines;
  roundId: string;
}) {
  const previewByItemId = new Map<string, EvaluationPreview[number]>();
  const previewByItemName = new Map<string, EvaluationPreview[number]>();
  for (const row of evaluationPreview) {
    if (row.itemId && !previewByItemId.has(row.itemId)) previewByItemId.set(row.itemId, row);
    if (row.itemName && !previewByItemName.has(row.itemName)) previewByItemName.set(row.itemName, row);
  }

  return (
    <div className="rounded-xl border border-[#d7dee8]">
      <table className="w-full table-fixed border-collapse text-left text-sm">
        <colgroup>
          <col className="w-[36px]" />
          <col className="w-[14%]" />
          <col className="w-[52px]" />
          <col className="w-[56px]" />
          <col className="w-[72px]" />
          <col className="w-[64px]" />
          <col />
        </colgroup>
        <thead className="bg-[#eef4fb] text-[#15345b]">
          <tr>
            <th className="px-2 py-2.5 text-center" scope="col">#</th>
            <th className="px-3 py-2.5" scope="col">평가항목</th>
            <th className="px-2 py-2.5 text-center" scope="col">배점</th>
            <th className="px-2 py-2.5 text-center" scope="col">AI</th>
            <th className="px-2 py-2.5 text-center" scope="col">전문가</th>
            <th className="px-2 py-2.5 text-center" scope="col">최종</th>
            <th className="px-3 py-2.5" scope="col">평가 근거 / 의견</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#d7dee8] bg-white">
          {results.map((result, index) => (
            <EvaluationResultRow
              index={index}
              key={result.item.id}
              preview={previewByItemId.get(result.item.id) ?? previewByItemName.get(result.item.detailItem)}
              referenceGuidelines={referenceGuidelines}
              referenceLaws={referenceLaws}
              result={result}
              roundId={roundId}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

const EvaluationResultRow = memo(function EvaluationResultRow({
  result,
  preview,
  referenceLaws,
  referenceGuidelines,
  roundId,
  index,
}: {
  result: HybridResult;
  preview: EvaluationPreview[number] | undefined;
  referenceLaws: ReferenceLaws;
  referenceGuidelines: ReferenceGuidelines;
  roundId: string;
  index: number;
}) {
  const itemLawLinks = matchItemReferenceLaws(preview, referenceLaws);
  const itemGuidelineLinks = matchItemReferenceGuidelines(preview, referenceGuidelines);

  return (
    <tr>
      <td className="px-2 py-3 align-top text-center text-xs font-bold text-[#64748b]">{index + 1}</td>
      <td className="px-3 py-3 align-top">
        <p className="text-sm font-bold leading-5 text-[#15345b]">{result.item.detailItem}</p>
        <p className="mt-0.5 text-[10px] leading-4 text-[#64748b]">
          {result.item.majorCategory} · {result.item.middleCategory}
        </p>
      </td>
      <td className="px-2 py-3 align-top text-center font-semibold text-[#15345b]">{result.item.points}</td>
      <td className="px-2 py-3 align-top text-center font-bold text-[#2463b3]">{result.aiEvaluation.score}</td>
      <td className="px-2 py-3 align-top text-center font-bold text-[#15345b]">{result.humanEvaluation.score}</td>
      <td className="px-2 py-3 align-top text-center">
        <ScoreValue>{result.finalScore}</ScoreValue>
        <p className="text-[10px] leading-4 text-[#64748b]">{result.finalGrade}</p>
      </td>
      <td className="px-3 py-3 align-top">
        <EvaluationRationaleCell
          guidelineLinks={itemGuidelineLinks}
          lawLinks={itemLawLinks}
          result={result}
          roundId={roundId}
        />
      </td>
    </tr>
  );
});

function EvaluationRationaleCell({
  result,
  lawLinks,
  guidelineLinks,
  roundId,
}: {
  result: HybridResult;
  lawLinks: Array<{ title: string; article: string; href: string | null }>;
  guidelineLinks: Array<{ title: string; section: string; href: string | null }>;
  roundId: string;
}) {
  return (
    <div className="space-y-2 text-xs leading-5 text-[#64748b]">
      <p className="whitespace-pre-wrap break-words text-[#475569]">
        <span className="font-semibold text-[#2463b3]">AI:</span> {result.aiEvaluation.rationale}
      </p>
      {result.humanEvaluation.comment ? (
        <p className="whitespace-pre-wrap break-words text-[#475569]">
          <span className="font-semibold text-[#15345b]">전문가:</span> {result.humanEvaluation.comment}
        </p>
      ) : null}
      <p className="whitespace-pre-wrap break-words font-semibold text-[#9a3412]">
        {result.aiEvaluation.recommendation}
      </p>
      {lawLinks.length > 0 || guidelineLinks.length > 0 ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-t border-[#e2e8f0] pt-2">
          {lawLinks.map((law) => (
            <span key={`${roundId}-${law.title}-${law.article}`}>
              {law.href ? (
                <ReferenceLinkTitle title={`${law.title} ${law.article}`} href={law.href} />
              ) : (
                <span className="text-[#2463b3]">
                  {law.title} {law.article}
                </span>
              )}
            </span>
          ))}
          {guidelineLinks.map((guide) => (
            <span key={`${roundId}-${guide.title}-${guide.section}`}>
              {guide.href ? (
                <ReferenceLinkTitle title={`${guide.title} ${guide.section}`} href={guide.href} />
              ) : (
                <span className="text-[#2463b3]">
                  {guide.title} {guide.section}
                </span>
              )}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function matchItemReferenceLaws(
  preview: EvaluationPreview[number] | undefined,
  referenceLaws: ReferenceLaws,
) {
  const citations = preview?.laws ?? [];
  const matched = referenceLaws.filter((law) =>
    citations.some((citation) => lawMatchesCitation(law, citation)),
  );

  if (matched.length > 0) {
    return matched.map((law) => ({
      title: law.title,
      article: law.article,
      href: buildLawReferenceUrl(law.title, law.sourceUrl),
    }));
  }

  return citations.map((citation) => ({
    title: citation,
    article: "",
    href: null,
  }));
}

function matchItemReferenceGuidelines(
  preview: EvaluationPreview[number] | undefined,
  referenceGuidelines: ReferenceGuidelines,
) {
  const citations = preview?.guidelines ?? [];
  const matched = referenceGuidelines.filter((guide) =>
    citations.some((citation) => guidelineMatchesCitation(guide, citation)),
  );

  if (matched.length > 0) {
    return matched.map((guide) => ({
      title: guide.title,
      section: guide.section,
      href: buildAdmrulReferenceUrl(guide.title, guide.sourceUrl),
    }));
  }

  return citations.map((citation) => ({
    title: citation,
    section: "",
    href: null,
  }));
}
