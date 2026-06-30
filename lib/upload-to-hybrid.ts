import {
  buildFallbackRationale,
  buildFallbackRecommendation,
  isGenericRationale,
  isGenericRecommendation,
} from "./ai/fallback-recommendation";
import type { UploadedFileSummary } from "./ai/analysis-types";
import type { EvaluationContext } from "./evaluation-context";
import { collectUniqueRoundFiles } from "./evaluation-round-files";
import { gradeScore, calculateHybridResults, calculateProjectScore } from "./hybrid-evaluation";
import type {
  AiEvaluation,
  EvaluationGrade,
  EvaluationItem,
  EvaluationRound,
  HumanEvaluation,
  HybridResult,
  HybridSettings,
} from "./types";

export type SessionHybridView = {
  round: EvaluationRound;
  settings: HybridSettings;
  results: HybridResult[];
  projectScore: number;
};

export function buildHybridViewFromRound(round: EvaluationRound): SessionHybridView {
  const settings: HybridSettings = {
    aiWeight: round.aiWeight,
    humanWeight: round.expertWeight,
  };

  const items = round.evaluationItems;
  const previewByItemId = new Map(
    round.aiAnalysis.evaluationPreview.map((row) => [row.itemId ?? row.itemName, row]),
  );

  const targetItems =
    items.length > 0
      ? items
      : round.aiAnalysis.evaluationPreview.map((row, index) => ({
          id: row.itemId ?? `preview-${index}`,
          majorCategory: "분석",
          middleCategory: "항목",
          detailItem: row.itemName,
          points: 10,
          description: "",
          criteria: row.rationale,
          lawIds: [],
          guidelineIds: [],
        }));

  const fileSummaries = buildStoredFileSummaries(round);
  const evaluationContext = buildStoredEvaluationContext(round);

  const aiEvaluations: AiEvaluation[] = targetItems.map((item, index) => {
    const preview =
      previewByItemId.get(item.id) ??
      round.aiAnalysis.evaluationPreview.find((row) => row.itemName === item.detailItem) ??
      round.aiAnalysis.evaluationPreview[index];

    const score = preview?.score ?? 75;
    const laws = preview?.laws ?? [];
    const lawEvidence =
      laws.length > 0 ? `적용 법령: ${laws.join(", ")}` : "업로드 자료 및 실시간 법령·공간정보 기반 분석";

    const rawRationale = preview?.rationale ?? item.criteria;
    const rawRecommendation = preview?.recommendation;
    const rationaleText = typeof rawRationale === "string" ? rawRationale.trim() : "";
    const recommendationText = typeof rawRecommendation === "string" ? rawRecommendation.trim() : "";

    return {
      itemId: item.id,
      score,
      grade: (preview?.grade as EvaluationGrade) ?? gradeScore(score),
      rationale: rationaleText && !isGenericRationale(rationaleText)
        ? rationaleText
        : buildFallbackRationale(item, fileSummaries, evaluationContext),
      recommendation:
        recommendationText && !isGenericRecommendation(recommendationText)
          ? recommendationText
          : buildFallbackRecommendation(item, fileSummaries, score),
      scoreTrace: [
        {
          label: "문서 분석",
          weight: 40,
          score: clamp(score + 2),
          evidence: round.aiAnalysis.summary,
        },
        {
          label: "법령·공간 맥락",
          weight: 35,
          score,
          evidence: lawEvidence,
        },
        {
          label: "평가기준 정합성",
          weight: 25,
          score: clamp(score - 1),
          evidence: item.criteria,
        },
      ],
      lawIds: [],
      guidelineIds: [],
      caseStudyIds: [],
    };
  });

  const humanScoreByItemId = new Map(round.expertItemScores.map((row) => [row.itemId, row]));

  const humanEvaluations: HumanEvaluation[] = targetItems.map((item) => {
    const expertRow = humanScoreByItemId.get(item.id);

    return {
      itemId: item.id,
      reviewerName: round.reviewerName,
      score: expertRow?.score ?? 0,
      comment: expertRow?.comment ?? "전문가 평가 자료에 해당 항목 점수가 없습니다.",
      attachmentName: collectUniqueRoundFiles(round)[0]?.originalName,
    };
  });

  const results = calculateHybridResults({
    items: targetItems,
    aiEvaluations,
    humanEvaluations,
    settings,
  });

  return {
    round,
    settings,
    results,
    projectScore: calculateProjectScore(results),
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildStoredFileSummaries(round: EvaluationRound): UploadedFileSummary[] {
  const corpus = [
    round.aiAnalysis.summary,
    ...round.aiAnalysis.documentSections.map((section) => `${section.label}: ${section.summary}`),
  ]
    .filter((part) => part?.trim())
    .join("\n");

  const files = collectUniqueRoundFiles(round);
  if (files.length === 0) {
    if (!corpus.trim()) return [];

    return [
      {
        id: "analysis-summary",
        originalName: "분석 요약",
        fileType: "text/plain",
        sizeBytes: corpus.length,
        storagePath: "",
        extractedTextPreview: corpus,
      },
    ];
  }

  return files.map((file, index) => ({
    id: file.id,
    originalName: file.originalName,
    fileType: file.fileType,
    sizeBytes: file.sizeBytes,
    storagePath: file.storageKey ?? "",
    extractedTextPreview: index === 0 ? corpus : "",
  }));
}

function buildStoredEvaluationContext(round: EvaluationRound): EvaluationContext {
  const analysis = round.aiAnalysis;

  return {
    spatial: analysis.spatialContext
      ? {
          address: analysis.spatialContext.address,
          point: { x: 0, y: 0, source: "address" },
          inLandscapeZone: analysis.spatialContext.inLandscapeZone,
          matchedZones: analysis.spatialContext.matchedZones,
          disclaimer: "",
        }
      : null,
    referenceLaws: (analysis.referenceLaws ?? []).map((law, index) => ({
      id: `stored-law-${index}`,
      title: law.title,
      article: law.article,
      summary: law.summary,
      ministry: "",
      enforcementDate: "",
      sourceUrl: law.sourceUrl,
      source: analysis.lawSource ?? "demo-fallback",
    })),
    referenceGuidelines: [],
    guidelines: [],
    lawSource: analysis.lawSource ?? "demo-fallback",
    guidelineSource: "demo-fallback",
    fetchedAt: analysis.contextFetchedAt ?? round.evaluatedAt,
    warnings: analysis.warnings ?? [],
  };
}
