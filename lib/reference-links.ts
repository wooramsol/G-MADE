import type { Guideline } from "./types";

type LawGoKrKind = "법령" | "행정규칙" | "자치법규";

type DocumentTarget =
  | { url: string }
  | { kind: LawGoKrKind; name: string };

const LAW_DOCUMENT_TARGETS: Record<string, DocumentTarget> = {
  경관법: { kind: "법령", name: "경관법" },
  "서울특별시 경관 조례": { kind: "자치법규", name: "서울특별시 경관 조례" },
  "인공조명에 의한 빛공해 방지법": { kind: "법령", name: "인공조명에 의한 빛공해 방지법" },
  장애인등편의법: { kind: "법령", name: "장애인·이동편의·편의시설 등의 보급 촉진에 관한 법률" },
  "도시공원 및 녹지 등에 관한 법률": { kind: "법령", name: "도시공원 및 녹지 등에 관한 법률" },
  "공공디자인의 진흥에 관한 법률": { kind: "법령", name: "공공디자인의 진흥에 관한 법률" },
  행정절차법: { kind: "법령", name: "행정절차법" },
};

const GUIDELINE_DOCUMENT_TARGETS: Record<string, DocumentTarget> = {
  "guide-skyline": { kind: "법령", name: "경관법" },
  // 국가법령정보센터 등록명: 경관심의운영지침 (데모 제목과 다름)
  "guide-facade": { kind: "행정규칙", name: "경관심의운영지침" },
  // 서울특별시 색채계획 조례는 등록되어 있지 않음 → 공공디자인 진흥 조례 본문
  "guide-color": { url: "https://www.law.go.kr/LSW/ordinInfoP.do?ordinSeq=1566971" },
  "guide-night": { kind: "법령", name: "인공조명에 의한 빛공해 방지법" },
  "guide-walk": { kind: "법령", name: "보행안전 및 편의증진에 관한 법률" },
  "guide-green": { kind: "법령", name: "도시공원 및 녹지 등에 관한 법률" },
  "guide-public-space": { kind: "법령", name: "공공디자인의 진흥에 관한 법률" },
  "guide-document": { kind: "법령", name: "경관법" },
};

export function buildLawGoKrDirectUrl(kind: LawGoKrKind, name: string): string {
  return `https://www.law.go.kr/${kind}/${encodeURIComponent(name.trim())}`;
}

function buildDocumentUrl(target: DocumentTarget): string {
  if ("url" in target) return target.url;
  return buildLawGoKrDirectUrl(target.kind, target.name);
}

function normalizeLawTitle(title: string): string {
  return title.replace(/\s+제\d+조.*$/u, "").trim();
}

function resolveDocumentTarget(title: string): DocumentTarget | null {
  const normalized = normalizeLawTitle(title);
  if (!normalized) return null;

  const exact = LAW_DOCUMENT_TARGETS[normalized];
  if (exact) return exact;

  const partial = Object.entries(LAW_DOCUMENT_TARGETS).find(
    ([key]) => normalized.includes(key) || key.includes(normalized),
  );
  if (partial) return partial[1];

  if (normalized.length >= 2) {
    return { kind: "법령", name: normalized };
  }

  return null;
}

export function buildLawReferenceUrl(title: string, _sourceUrl?: string): string | null {
  const target = resolveDocumentTarget(title);
  return target ? buildDocumentUrl(target) : null;
}

export function buildGuidelineReferenceUrl(guide: Pick<Guideline, "id" | "title">): string | null {
  const mapped = GUIDELINE_DOCUMENT_TARGETS[guide.id];
  if (!mapped) return null;
  return buildDocumentUrl(mapped);
}

export function isExternalUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
