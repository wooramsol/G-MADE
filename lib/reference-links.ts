import type { Guideline } from "./types";

/** 국가법령정보센터 본문 상세 URL (화이트리스트·API 결과만 허용) */
const LAW_DOCUMENT_URLS: Record<string, string> = {
  경관법: "https://www.law.go.kr/LSW/lsEfInfoP.do?lsId=010447",
  "서울특별시 경관 조례": "https://www.law.go.kr/LSW/ordinInfoP.do?ordinSeq=1859125",
  "인공조명에 의한 빛공해 방지법": "https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=199543",
  장애인등편의법:
    "https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=167743",
  "장애인·노인·임산부 등의 편의증진 보장에 관한 법률":
    "https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=167743",
  "도시공원 및 녹지 등에 관한 법률": "https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=260467",
  "공공디자인의 진흥에 관한 법률": "https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=253537",
  행정절차법: "https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=165531",
  "보행안전 및 편의증진에 관한 법률": "https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=162182",
};

const GUIDELINE_DOCUMENT_URLS: Record<string, string> = {
  "guide-skyline": LAW_DOCUMENT_URLS["경관법"],
  "guide-facade": "https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2100000129249",
  "guide-color": "https://www.law.go.kr/LSW/ordinInfoP.do?ordinSeq=1566971",
  "guide-night": LAW_DOCUMENT_URLS["인공조명에 의한 빛공해 방지법"],
  "guide-walk": LAW_DOCUMENT_URLS["보행안전 및 편의증진에 관한 법률"],
  "guide-green": LAW_DOCUMENT_URLS["도시공원 및 녹지 등에 관한 법률"],
  "guide-public-space": LAW_DOCUMENT_URLS["공공디자인의 진흥에 관한 법률"],
  "guide-document": LAW_DOCUMENT_URLS["경관법"],
};

const VERIFIED_DETAIL_URL_PATTERN =
  /^https:\/\/(?:www\.)?law\.go\.kr\/LSW\/(?:lsInfoP|lsEfInfoP|ordinInfoP|admRulInfoP)\.do\?(?:.*&)?(?:lsiSeq|lsId|ordinSeq|admRulSeq)=\d+/i;

export function buildLawGoKrDetailUrl(mst: string): string | null {
  const normalized = mst.trim();
  if (!/^\d+$/.test(normalized)) return null;
  return `https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=${normalized}`;
}

export function buildAdmrulDetailUrl(admRulSeq: string): string | null {
  const normalized = admRulSeq.trim();
  if (!/^\d+$/.test(normalized)) return null;
  return `https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=${normalized}`;
}

export function buildAdmrulReferenceUrl(_title: string, sourceUrl?: string): string | null {
  if (sourceUrl && isVerifiedLawGoKrDetailUrl(sourceUrl)) return sourceUrl;
  return null;
}

export function isVerifiedLawGoKrDetailUrl(url: string): boolean {
  return VERIFIED_DETAIL_URL_PATTERN.test(url.trim());
}

function normalizeLawTitle(title: string): string {
  return title.replace(/\s+제\d+조.*$/u, "").trim();
}

function resolveLawDocumentUrl(title: string): string | null {
  const normalized = normalizeLawTitle(title);
  if (!normalized) return null;

  const exact = LAW_DOCUMENT_URLS[normalized];
  if (exact) return exact;

  const partial = Object.entries(LAW_DOCUMENT_URLS).find(
    ([key]) => normalized.includes(key) || key.includes(normalized),
  );
  return partial?.[1] ?? null;
}

export function hasLawReferenceUrl(title: string, sourceUrl?: string): boolean {
  return buildLawReferenceUrl(title, sourceUrl) !== null;
}

export function hasGuidelineReferenceUrl(guide: Pick<Guideline, "id">): boolean {
  return Boolean(GUIDELINE_DOCUMENT_URLS[guide.id]);
}

export function buildLawReferenceUrl(title: string, sourceUrl?: string): string | null {
  if (sourceUrl && isVerifiedLawGoKrDetailUrl(sourceUrl)) return sourceUrl;
  return resolveLawDocumentUrl(title);
}

export function buildGuidelineReferenceUrl(guide: Pick<Guideline, "id" | "title">): string | null {
  return GUIDELINE_DOCUMENT_URLS[guide.id] ?? null;
}

export function isExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
