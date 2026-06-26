import type { UploadAnalysisResult } from "@/lib/ai/analysis-types";
import { toStoredReferenceLaws } from "@/lib/dedupe-reference-laws";
import type { EvaluationContext } from "@/lib/evaluation-context";
import { gradeScore } from "@/lib/hybrid-evaluation";
import { pickRelatedReferenceLaws } from "@/lib/related-reference-laws";
import { pickRelatedReferenceGuidelines, toStoredReferenceGuidelines } from "@/lib/related-reference-guidelines";
import type { EvaluationItem } from "@/lib/types";

export function createSkippedUploadAnalysis(
  evaluationContext: EvaluationContext,
  evaluationItems: EvaluationItem[],
  side: "ai" | "expert",
  baseWarnings: string[] = [],
): UploadAnalysisResult {
  const label = side === "ai" ? "AI" : "전문가";

  return {
    provider: "none",
    mode: "skipped",
    summary: `${label} 평가 가중치가 0%이므로 ${label} 자료 분석을 생략했습니다.`,
    documentSections: [],
    evaluationPreview: evaluationItems.map((item) => ({
      itemId: item.id,
      itemName: item.detailItem,
      score: 0,
      grade: gradeScore(0),
      rationale: `${label} 가중치 0% — 분석 생략`,
      recommendation: "해당 가중치가 최종 점수에 반영되지 않습니다.",
      laws: [],
      guidelines: [],
    })),
    referenceLaws: toStoredReferenceLaws(
      pickRelatedReferenceLaws({
        pool: evaluationContext.referenceLaws,
        evaluationItems,
      })
        .filter((law) => law.sourceUrl)
        .map((law) => ({
          title: law.title,
          article: law.article,
          summary: law.summary,
          sourceUrl: law.sourceUrl,
        })),
    ),
    referenceGuidelines: toStoredReferenceGuidelines(
      pickRelatedReferenceGuidelines({
        pool: evaluationContext.referenceGuidelines,
        evaluationItems,
      })
        .filter((guide) => guide.sourceUrl)
        .map((guide) => ({
          title: guide.title,
          section: guide.section,
          summary: guide.summary,
          sourceUrl: guide.sourceUrl,
        })),
    ),
    spatialContext: evaluationContext.spatial,
    lawSource: evaluationContext.lawSource,
    guidelineSource: evaluationContext.guidelineSource,
    contextFetchedAt: evaluationContext.fetchedAt,
    warnings: [...baseWarnings, `${label} 평가 가중치 0%로 자료 분석을 건너뛰었습니다.`],
  };
}
