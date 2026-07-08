import { lawMatchesCitation } from "../related-reference-laws";
import type { EvaluationRound } from "../types";
import type { LawReviewEntry } from "./types";

/** 법령·지침 자동 검토표를 평가 결과에서 도출합니다. */
export function deriveLawReviewEntries(
  round: EvaluationRound,
  referenceLaws: NonNullable<EvaluationRound["aiAnalysis"]["referenceLaws"]>,
): LawReviewEntry[] {
  const entries = new Map<string, LawReviewEntry>();

  for (const law of referenceLaws) {
    const key = `${law.title}::${law.article}`;
    entries.set(key, {
      id: key,
      title: law.title,
      article: law.article,
      summary: law.summary,
      sourceUrl: law.sourceUrl,
      status: "참고",
      relatedItems: [],
      citations: [],
    });
  }

  for (const preview of round.aiAnalysis.evaluationPreview) {
    const itemLabel = preview.itemName;
    const citations = preview.laws ?? [];

    for (const citation of citations) {
      const matched = referenceLaws.find((law) => lawMatchesCitation(law, citation));
      if (matched) {
        const key = `${matched.title}::${matched.article}`;
        const existing = entries.get(key) ?? {
          id: key,
          title: matched.title,
          article: matched.article,
          summary: matched.summary,
          sourceUrl: matched.sourceUrl,
          status: "검토필요" as const,
          relatedItems: [],
          citations: [],
        };
        if (!existing.relatedItems.includes(itemLabel)) {
          existing.relatedItems.push(itemLabel);
        }
        if (!existing.citations.includes(citation)) {
          existing.citations.push(citation);
        }
        existing.status = "검토필요";
        entries.set(key, existing);
        continue;
      }

      const key = `citation::${citation}`;
      const existing = entries.get(key) ?? {
        id: key,
        title: citation,
        article: "",
        summary: "AI 분석에서 인용된 조문입니다. law.go.kr 본문과 대조해 주세요.",
        sourceUrl: "",
        status: "검토필요" as const,
        relatedItems: [],
        citations: [citation],
      };
      if (!existing.relatedItems.includes(itemLabel)) {
        existing.relatedItems.push(itemLabel);
      }
      entries.set(key, existing);
    }
  }

  for (const guide of round.aiAnalysis.referenceGuidelines ?? []) {
    const key = `guide::${guide.title}::${guide.section}`;
    if (entries.has(key)) continue;

    const relatedItems = round.aiAnalysis.evaluationPreview
      .filter((preview) => (preview.guidelines ?? []).some((citation) => citation.includes(guide.title)))
      .map((preview) => preview.itemName);

    entries.set(key, {
      id: key,
      title: guide.title,
      article: guide.section,
      summary: guide.summary,
      sourceUrl: guide.sourceUrl,
      status: relatedItems.length > 0 ? "검토필요" : "참고",
      relatedItems,
      citations: relatedItems.length > 0 ? [`${guide.title} ${guide.section}`] : [],
    });
  }

  return Array.from(entries.values()).sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "검토필요" ? -1 : 1;
    }
    return a.title.localeCompare(b.title, "ko");
  });
}
