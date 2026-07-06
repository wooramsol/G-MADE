import { gradeScore } from "../hybrid-evaluation";
import type { EvaluationItem } from "../types";
import type { UploadAnalysisResult } from "./analysis-types";
import type { AiProviderId } from "./types";
import { formatProviderBadgeLabel } from "./provider-labels";

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

function pickLongestText(candidates: string[]): string {
  return candidates
    .map((text) => text.trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length)[0] ?? "";
}

function mergeUniqueLines(values: string[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const value of values) {
    for (const line of value.split(/\n+/)) {
      const trimmed = line.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      lines.push(trimmed);
    }
  }

  return lines.join("\n");
}

export function mergeConsensusAnalysis(input: {
  analyses: Array<{ provider: AiProviderId; analysis: UploadAnalysisResult }>;
  items: EvaluationItem[];
  providersUsed: AiProviderId[];
}): UploadAnalysisResult {
  const { analyses, items, providersUsed } = input;
  if (analyses.length === 0) {
    throw new Error("합의할 AI 분석 결과가 없습니다.");
  }

  const template = analyses[0]!.analysis;
  const providerLabels = providersUsed.map((provider) => formatProviderBadgeLabel(provider)).join(" · ");

  const evaluationPreview = items.map((item) => {
    const rows = analyses
      .map((entry) => entry.analysis.evaluationPreview.find((row) => row.itemId === item.id))
      .filter((row): row is NonNullable<typeof row> => Boolean(row));

    if (rows.length === 0) {
      return {
        itemId: item.id,
        itemName: item.detailItem,
        score: 0,
        grade: gradeScore(0),
        rationale: "AI 합의 결과 없음",
        recommendation: "자료 재확인 필요",
        laws: [],
        guidelines: [],
      };
    }

    const score = median(rows.map((row) => row.score));
    const rationale = mergeUniqueLines(rows.map((row) => row.rationale));
    const recommendation = pickLongestText(rows.map((row) => row.recommendation));
    const laws = [...new Set(rows.flatMap((row) => row.laws))];
    const guidelines = [...new Set(rows.flatMap((row) => row.guidelines))];

    return {
      itemId: item.id,
      itemName: rows[0]?.itemName ?? item.detailItem,
      score,
      grade: gradeScore(score),
      rationale,
      recommendation,
      laws,
      guidelines,
    };
  });

  const summaries = analyses.map((entry) => `[${formatProviderBadgeLabel(entry.provider)}] ${entry.analysis.summary}`);
  const documentSections = template.documentSections.length > 0
    ? template.documentSections
    : analyses.find((entry) => entry.analysis.documentSections.length > 0)?.analysis.documentSections ?? [];

  return {
    ...template,
    provider: "ensemble",
    mode: "live",
    summary: `Gemini·ChatGPT·Claude ${providersUsed.length}개 엔진 상호 검토 합의 결과입니다.\n${mergeUniqueLines(summaries)}`,
    documentSections,
    evaluationPreview,
    warnings: [
      ...(template.warnings ?? []),
      `AI 종합 평가: ${providerLabels} ${providersUsed.length}개 엔진 병렬 분석 후 상호 피드백·합의 점수(중앙값)를 적용했습니다.`,
    ],
  };
}
