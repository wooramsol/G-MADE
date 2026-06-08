import type { CaseStudy, Guideline } from "./types";

export function formatLawLinkLabel(title: string, article: string): string {
  const trimmedArticle = article.trim();
  if (!trimmedArticle) return `「${title}」 법령 검색`;
  return `「${title}」 ${trimmedArticle} 검색`;
}

export function formatGuidelineLinkLabel(title: string, section: string): string {
  return `「${title}」 ${section}절 행정규칙 검색`;
}

export function formatCaseStudyLinkLabel(title: string): string {
  return `「${title}」 관련 우수사례 검색`;
}

export function buildLawGoKrLawSearchUrl(query: string): string {
  const params = new URLSearchParams({ query: query.trim() });
  return `https://www.law.go.kr/lsSc.do?${params.toString()}`;
}

export function buildLawGoKrAdmRuleSearchUrl(query: string): string {
  const params = new URLSearchParams({ query: query.trim() });
  return `https://www.law.go.kr/admRulSc.do?${params.toString()}`;
}

export function buildGuidelineReferenceUrl(guide: Pick<Guideline, "title">): string {
  return buildLawGoKrAdmRuleSearchUrl(guide.title);
}

export function buildCaseStudyReferenceUrl(
  caseStudy: Pick<CaseStudy, "title" | "location" | "projectType">,
): string {
  const query = [caseStudy.title, caseStudy.location, caseStudy.projectType, "경관 우수사례"]
    .filter(Boolean)
    .join(" ");
  const params = new URLSearchParams({ query });
  return `https://search.naver.com/search.naver?${params.toString()}`;
}

export function buildLawReferenceUrl(title: string, _sourceUrl?: string): string {
  return buildLawGoKrLawSearchUrl(title);
}

export function isExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
