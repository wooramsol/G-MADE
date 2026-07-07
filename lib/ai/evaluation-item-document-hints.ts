import type { EvaluationItem } from "../types";

export type DocumentSectionRecord = {
  itemId?: string;
  label: string;
  confidence: number;
  summary: string;
};

/** 평가항목별로 심의 자료에서 찾을 키워드(도면·계획 유형 포함) */
export const EVALUATION_ITEM_DOCUMENT_KEYWORDS: Record<string, string[]> = {
  "item-urban-scale": ["스카이라인", "조감", "매스", "규모", "층수", "연면적", "주변", "현황", "배치도"],
  "item-facade": ["입면", "입면도", "마감", "재료", "개구부", "저층부", "형태"],
  "item-color": ["색채", "주조색", "강조색", "마감재", "반사", "색채계획"],
  "item-nightscape": ["야간", "조명", "휘도", "눈부심", "조도", "빛공해", "야간경관"],
  "item-walk": ["보행", "동선", "접근", "계단", "경사", "난간", "주차", "보행동선"],
  "item-green": ["녹지", "조경", "식재", "수목", "관수", "생태", "녹지계획"],
  "item-public-space": ["공공", "휴게", "옥외", "옥상", "공개공지", "체류", "공공공간"],
};

/** 구버전 도면·계획 유형 라벨 → 평가항목 id */
export const LEGACY_DOCUMENT_SECTION_LABEL_TO_ITEM_ID: Record<string, string> = {
  건축개요: "item-urban-scale",
  배치도: "item-walk",
  입면도: "item-facade",
  조감도: "item-urban-scale",
  색채계획: "item-color",
  야간경관: "item-nightscape",
  보행동선: "item-walk",
  녹지계획: "item-green",
  공공공간: "item-public-space",
  주변현황: "item-urban-scale",
};

export function normalizeEvaluationItemLabel(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

export function getDocumentKeywordsForItem(item: EvaluationItem): string[] {
  const byId = EVALUATION_ITEM_DOCUMENT_KEYWORDS[item.id];
  const base = byId ? [...byId] : [];
  return [...new Set([...base, item.detailItem, item.middleCategory, item.majorCategory])];
}

export function matchItemBySectionLabel(label: string, items: EvaluationItem[]): EvaluationItem | undefined {
  const normalized = normalizeEvaluationItemLabel(label);
  if (!normalized) return undefined;

  const direct = items.find((item) => normalizeEvaluationItemLabel(item.detailItem) === normalized);
  if (direct) return direct;

  const legacyId = LEGACY_DOCUMENT_SECTION_LABEL_TO_ITEM_ID[label.trim()];
  if (legacyId) {
    const legacyMatch = items.find((item) => item.id === legacyId);
    if (legacyMatch) return legacyMatch;
  }

  return items.find((item) => {
    const detail = normalizeEvaluationItemLabel(item.detailItem);
    return detail.includes(normalized) || normalized.includes(detail);
  });
}

export function matchItemBySectionRecord(
  section: Pick<DocumentSectionRecord, "itemId" | "label">,
  items: EvaluationItem[],
): EvaluationItem | undefined {
  if (section.itemId) {
    const byId = items.find((item) => item.id === section.itemId);
    if (byId) return byId;
  }
  return matchItemBySectionLabel(section.label, items);
}
