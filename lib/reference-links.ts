export function formatLawLinkLabel(title: string, article: string): string {
  const trimmedArticle = article.trim();
  if (!trimmedArticle) return `「${title}」 법령 전문 보기`;
  return `「${title}」 ${trimmedArticle} 보기`;
}

export function formatGuidelineLinkLabel(title: string, section: string): string {
  return `「${title}」 ${section}절 지침 보기`;
}

export function formatCaseStudyLinkLabel(title: string): string {
  return `「${title}」 사례 상세 보기`;
}

export function isExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
