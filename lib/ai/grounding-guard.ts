import type { EvaluationContext } from "../evaluation-context";
import type { EvaluationItem } from "../types";
import { lawMatchesCitation } from "../related-reference-laws";
import { guidelineMatchesCitation } from "../related-reference-guidelines";
import type { UploadedFileSummary } from "./analysis-types";
import {
  buildFallbackRationale,
  buildFallbackRecommendation,
  isGenericRationale,
  isGenericRecommendation,
  lacksIssueFocus,
} from "./fallback-recommendation";

const SPACE_TERM_PATTERN =
  /(?:\d+층\s*)?(?:옥외(?:\s*공간)?|옥상(?:\s*정원|\s*테라스)?|공개공지|증축(?:\s*부분|\s*동)?|(?:옥외|야외)\s*휴게(?:\s*공간)?|(?:중정|마당|데크|발코니))/g;

const USER_TERM_PATTERN = /고령\s*(?:이용자|층|복지|시설)?|어르신|보행약자|장애인/g;

const LAW_CITATION_PATTERN =
  /(?:경관의?\s*법률|경관\s*조례|빛공해|장애인|녹지|공공디자인|행정절차)[^,.]{0,24}제\s*\d+\s*조/g;

const QUOTED_PASSAGE_PATTERN = /"([^"]{8,})"/g;

export type GroundingIssue =
  | { kind: "quoted_not_in_corpus"; detail: string }
  | { kind: "unknown_file"; detail: string }
  | { kind: "ungrounded_space"; detail: string }
  | { kind: "ungrounded_user"; detail: string }
  | { kind: "ungrounded_law"; detail: string };

export type GroundingCheckResult = {
  grounded: boolean;
  issues: GroundingIssue[];
};

export function buildAnalysisCorpus(files: UploadedFileSummary[]): string {
  return files
    .map((file) => file.extractedTextPreview ?? "")
    .filter((part) => part.trim())
    .join("\n");
}

export function normalizeForGroundingMatch(text: string): string {
  return text.replace(/\s+/g, "").replace(/[「」""'…]/g, "").toLowerCase();
}

export function snippetAppearsInCorpus(snippet: string, corpus: string): boolean {
  const trimmed = snippet.trim();
  if (trimmed.length < 8) return true;
  if (!corpus.trim()) return false;

  const normSnippet = normalizeForGroundingMatch(trimmed);
  const normCorpus = normalizeForGroundingMatch(corpus);
  if (normSnippet.length < 8) return true;
  if (normCorpus.includes(normSnippet)) return true;

  const words = trimmed.split(/\s+/).filter((word) => word.length >= 2);
  if (words.length >= 3) {
    const matched = words.filter((word) => normCorpus.includes(normalizeForGroundingMatch(word)));
    return matched.length / words.length >= 0.7;
  }

  return normSnippet.length >= 12 && normCorpus.includes(normSnippet.slice(0, Math.min(24, normSnippet.length)));
}

function extractQuotedPassages(text: string): string[] {
  const passages: string[] = [];
  for (const match of text.matchAll(QUOTED_PASSAGE_PATTERN)) {
    const value = (match[1] ?? "").trim();
    if (value.length >= 8) passages.push(value);
  }
  return passages;
}

function extractArticleNumber(text: string): string | null {
  const match = text.match(/제\s*(\d+)\s*조/);
  return match?.[1] ?? null;
}

function lawCitationIsVerified(citation: string, evaluationContext: EvaluationContext): boolean {
  return evaluationContext.referenceLaws.some((law) => {
    if (!lawMatchesCitation(law, citation)) return false;

    const citationArticle = extractArticleNumber(citation);
    const lawArticle = extractArticleNumber(law.article);
    if (citationArticle && lawArticle) {
      return citationArticle === lawArticle;
    }

    return true;
  });
}

function extractMentionedFileNames(text: string, files: UploadedFileSummary[]): string[] {
  const names = new Set<string>();
  for (const match of text.matchAll(/「([^」]+)」/g)) {
    const value = match[1]?.trim();
    if (value) names.add(value);
  }

  for (const file of files) {
    if (text.includes(file.originalName)) {
      names.add(file.originalName);
    }
  }

  return [...names];
}

function fileNameIsKnown(name: string, files: UploadedFileSummary[]): boolean {
  return files.some(
    (file) => file.originalName === name || file.originalName.includes(name) || name.includes(file.originalName),
  );
}

function allowedAnchorTerms(item?: EvaluationItem, evaluationContext?: EvaluationContext): string[] {
  const anchors: string[] = [];
  if (item) {
    anchors.push(item.detailItem, item.middleCategory, item.majorCategory, item.criteria, item.description);
  }
  if (evaluationContext?.project) {
    anchors.push(
      evaluationContext.project.name,
      evaluationContext.project.location,
      evaluationContext.project.reviewType,
      evaluationContext.project.projectType,
    );
  }
  for (const zone of evaluationContext?.spatial?.matchedZones ?? []) {
    anchors.push(zone.name, zone.jurisdiction);
  }
  for (const law of evaluationContext?.referenceLaws ?? []) {
    anchors.push(law.title, law.article, `${law.title} ${law.article}`);
  }
  for (const guide of evaluationContext?.guidelines ?? []) {
    anchors.push(guide.title, guide.section, `${guide.title} ${guide.section}`);
  }
  return anchors.filter((value) => value?.trim());
}

function termIsAllowed(term: string, allowedTerms: string[], corpus: string): boolean {
  const normTerm = normalizeForGroundingMatch(term);
  if (!normTerm) return true;

  const normCorpus = normalizeForGroundingMatch(corpus);
  if (normCorpus.includes(normTerm)) return true;

  return allowedTerms.some((anchor) => {
    const normAnchor = normalizeForGroundingMatch(anchor);
    return normAnchor.includes(normTerm) || normTerm.includes(normAnchor);
  });
}

function collectPatternMatches(text: string, pattern: RegExp): string[] {
  const found = new Set<string>();
  const scoped = new RegExp(pattern.source, pattern.flags);
  for (const match of text.matchAll(scoped)) {
    const value = match[0].trim();
    if (value.length >= 2) found.add(value);
  }
  return [...found];
}

/** AI가 쓴 평가 문장이 제출 자료·조회 맥락에 실제로 닿아 있는지 검사합니다. */
export function checkEvaluationTextGrounding(
  text: string,
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
  item?: EvaluationItem,
): GroundingCheckResult {
  const normalized = text.trim();
  if (!normalized) {
    return { grounded: false, issues: [{ kind: "quoted_not_in_corpus", detail: "empty" }] };
  }

  const corpus = buildAnalysisCorpus(files);
  const allowedTerms = allowedAnchorTerms(item, evaluationContext);
  const issues: GroundingIssue[] = [];
  const hasCorpus = corpus.trim().length >= 40;

  for (const quote of extractQuotedPassages(normalized)) {
    if (hasCorpus && !snippetAppearsInCorpus(quote, corpus)) {
      issues.push({ kind: "quoted_not_in_corpus", detail: quote.slice(0, 80) });
    }
  }

  for (const fileName of extractMentionedFileNames(normalized, files)) {
    if (!fileNameIsKnown(fileName, files)) {
      issues.push({ kind: "unknown_file", detail: fileName });
    }
  }

  if (hasCorpus) {
    for (const space of collectPatternMatches(normalized, SPACE_TERM_PATTERN)) {
      if (!termIsAllowed(space, allowedTerms, corpus)) {
        issues.push({ kind: "ungrounded_space", detail: space });
      }
    }

    for (const user of collectPatternMatches(normalized, USER_TERM_PATTERN)) {
      if (!termIsAllowed(user, allowedTerms, corpus)) {
        issues.push({ kind: "ungrounded_user", detail: user });
      }
    }
  }

  for (const lawCitation of collectPatternMatches(normalized, LAW_CITATION_PATTERN)) {
    if (!lawCitationIsVerified(lawCitation, evaluationContext)) {
      issues.push({ kind: "ungrounded_law", detail: lawCitation });
    }
  }

  return { grounded: issues.length === 0, issues };
}

export function isUngroundedAiText(
  text: string | undefined,
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
  item?: EvaluationItem,
): boolean {
  if (!text?.trim()) return true;
  return !checkEvaluationTextGrounding(text, files, evaluationContext, item).grounded;
}

export function filterVerifiedLawRefs(refs: string[], evaluationContext: EvaluationContext): string[] {
  return refs.filter((ref) => lawCitationIsVerified(ref, evaluationContext));
}

export function filterVerifiedGuidelineRefs(refs: string[], evaluationContext: EvaluationContext): string[] {
  return refs.filter((ref) =>
    evaluationContext.guidelines.some((guide) => guidelineMatchesCitation(guide, ref)),
  );
}

export function formatGroundingWarning(itemLabel: string, field: "rationale" | "recommendation", issues: GroundingIssue[]): string {
  const labels: Record<GroundingIssue["kind"], string> = {
    quoted_not_in_corpus: "본문 인용 미확인",
    unknown_file: "존재하지 않는 파일명",
    ungrounded_space: "자료에 없는 공간·위치",
    ungrounded_user: "자료에 없는 이용자 유형",
    ungrounded_law: "조회되지 않은 법령 인용",
  };
  const detail = issues
    .slice(0, 2)
    .map((issue) => `${labels[issue.kind]}(${issue.detail})`)
    .join(", ");
  const fieldLabel = field === "rationale" ? "점수 근거" : "개선 권고";
  return `${itemLabel} ${fieldLabel}: 제출 자료·조회 맥락에서 확인되지 않은 내용을 보정했습니다 — ${detail}`;
}

export function resolveGroundedRationale(
  raw: unknown,
  item: EvaluationItem,
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
): { text: string; warning?: string } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text || isGenericRationale(text)) {
    return { text: buildFallbackRationale(item, files, evaluationContext) };
  }

  const grounding = checkEvaluationTextGrounding(text, files, evaluationContext, item);
  if (!grounding.grounded || lacksIssueFocus(text)) {
    return {
      text: buildFallbackRationale(item, files, evaluationContext),
      warning: grounding.grounded
        ? `${item.detailItem} 점수 근거: 칭찬·긍정 위주 서술을 검토·보완 필요 사항 중심으로 보정했습니다.`
        : formatGroundingWarning(item.detailItem, "rationale", grounding.issues),
    };
  }

  return { text };
}

export function resolveGroundedRecommendation(
  raw: unknown,
  item: EvaluationItem,
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
  score: number,
): { text: string; warning?: string } {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text || isGenericRecommendation(text)) {
    return { text: buildFallbackRecommendation(item, files, score) };
  }

  const grounding = checkEvaluationTextGrounding(text, files, evaluationContext, item);
  if (!grounding.grounded || lacksIssueFocus(text)) {
    return {
      text: buildFallbackRecommendation(item, files, score),
      warning: grounding.grounded
        ? `${item.detailItem} 검토 의견: 칭찬·긍정 위주 서술을 수정·보완·검토 사항 중심으로 보정했습니다.`
        : formatGroundingWarning(item.detailItem, "recommendation", grounding.issues),
    };
  }

  return { text };
}

export function sanitizeGroundedSummary(
  summary: string,
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
): { text: string; warning?: string } {
  const text = summary.trim();
  if (!text) {
    return { text: "업로드 자료와 실시간 법령·경관지구 정보를 기반으로 AI 분석을 완료했습니다." };
  }

  const grounding = checkEvaluationTextGrounding(text, files, evaluationContext);
  if (grounding.grounded) return { text };

  return {
    text: "제출 자료 전반에서 심사위원이 우선 재확인해야 할 누락·모순·보완 필요 사항이 있습니다. 항목별 검토·보완 의견을 확인하세요.",
    warning: "AI 요약에 긍정·칭찬 위주 서술이 있어 검토 필요 사항 중심으로 요약을 보정했습니다.",
  };
}
