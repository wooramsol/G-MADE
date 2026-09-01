import { isTocPageText, parsePageSlices } from "@/lib/ai/page-citation";
import type { UploadedFileSummary } from "@/lib/ai/uploaded-file";

/**
 * 도면 인덱스 — 각 페이지의 표제란(도면명·축척) 텍스트를 읽어 "이 문서의
 * 몇 페이지에 어떤 도면이 있는지" 목차를 만든다.
 *
 * 용도:
 * 1) 평가 프롬프트에 [도면 목차]로 제공 — 모델이 항목별로 봐야 할 도면
 *    페이지를 정확히 인용하도록 유도.
 * 2) 심화 판독(줌)의 페이지 선정 — "항목 주제 → 도면 유형 → 해당 페이지"
 *    매핑으로, 키워드 추측보다 정확한 확대 대상을 고른다.
 *
 * 비용 0원: 이미 추출된 텍스트 레이어만 사용한다.
 */

export type DrawingIndexEntry = {
  fileName: string;
  page: number;
  /** 인식된 도면 유형 (배치도·입면도 등, 복수 가능) */
  types: string[];
  /** 표제란의 축척 표기 (예: "1/600", "NTS") */
  scale?: string;
};

/** 도면 유형 사전 — 표제란·제목부에 흔히 쓰이는 표기 */
const DRAWING_TYPE_PATTERNS: Array<{ type: string; pattern: RegExp }> = [
  { type: "조감도", pattern: /조\s*감\s*도/ },
  { type: "투시도", pattern: /투\s*시\s*도/ },
  { type: "배치도", pattern: /배\s*치\s*도/ },
  { type: "평면도", pattern: /평\s*면\s*도/ },
  { type: "입면도", pattern: /입\s*면\s*도/ },
  { type: "단면도", pattern: /[단종횡]\s*단?\s*면\s*도/ },
  { type: "스카이라인", pattern: /스\s*카\s*이\s*라\s*인|sky\s*line/i },
  { type: "옹벽", pattern: /옹\s*벽/ },
  { type: "조경계획", pattern: /조\s*경\s*계?\s*획|식\s*재\s*계?\s*획/ },
  { type: "색채계획", pattern: /색\s*채\s*계?\s*획|color\s*&?\s*material|재\s*료\s*계?\s*획|마\s*감\s*재/i },
  { type: "야간경관", pattern: /야\s*간\s*경\s*관|경\s*관\s*조\s*명/ },
  { type: "동선계획", pattern: /동\s*선\s*계?\s*획|보\s*행\s*동\s*선/ },
  { type: "주차계획", pattern: /주\s*차\s*계?\s*획/ },
  { type: "담장", pattern: /담\s*장|울\s*타\s*리/ },
  { type: "옥외광고물", pattern: /옥\s*외\s*광\s*고/ },
  { type: "현황분석", pattern: /현\s*황\s*분\s*석|상\s*위\s*계\s*획/ },
];

/** 항목 주제 → 우선 확인할 도면 유형 매핑 (심화 판독 페이지 선정용) */
const TOPIC_TO_DRAWING_TYPES: Array<{ pattern: RegExp; types: string[] }> = [
  { pattern: /옹벽|절토|성토|지형|구릉|비탈|경사/, types: ["옹벽", "단면도", "배치도"] },
  { pattern: /스카이라인|입면|형태|외관|층수|높이/, types: ["입면도", "스카이라인", "단면도"] },
  { pattern: /색채|색상|재료|마감|자연재료/, types: ["색채계획", "입면도"] },
  { pattern: /조경|식재|녹지|수목|가로수/, types: ["조경계획", "배치도"] },
  { pattern: /야간|조명/, types: ["야간경관"] },
  { pattern: /보행|동선|가로체계|통행/, types: ["동선계획", "배치도"] },
  { pattern: /주차/, types: ["주차계획", "배치도"] },
  { pattern: /담장|울타리|경계/, types: ["담장", "배치도"] },
  { pattern: /광고물|간판/, types: ["옥외광고물", "입면도"] },
  { pattern: /조망|경관축|통경|개방감/, types: ["조감도", "투시도", "배치도"] },
  { pattern: /배치|이격|인접|주변|연속성/, types: ["배치도", "조감도"] },
];

const SCALE_PATTERN = /(?:축\s*척|scale)[^\n]{0,24}?(1\s*[/:]\s*\d{2,5}|n\.?t\.?s)|(?:^|\s)(1\s*\/\s*\d{2,5})(?:\s|$)/im;

/** 제목부·표제란 근사 영역 — 페이지 텍스트의 앞 300자 + 뒤 400자 */
function titleZonesOf(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 700) return trimmed;
  return `${trimmed.slice(0, 300)}\n${trimmed.slice(-400)}`;
}

export function buildDrawingIndex(files: UploadedFileSummary[]): DrawingIndexEntry[] {
  const entries: DrawingIndexEntry[] = [];
  for (const slice of parsePageSlices(files)) {
    const text = slice.text.trim();
    if (!text || isTocPageText(text)) continue;
    const zone = titleZonesOf(text);

    const types = DRAWING_TYPE_PATTERNS.filter(({ pattern }) => pattern.test(zone)).map(({ type }) => type);
    if (types.length === 0) continue;

    const scaleMatch = zone.match(SCALE_PATTERN);
    const scale = (scaleMatch?.[1] ?? scaleMatch?.[2])?.replace(/\s+/g, "").toUpperCase();

    entries.push({ fileName: slice.fileName, page: slice.page, types, scale });
  }
  return entries;
}

/** 프롬프트용 요약 — "p.12 배치도(1/600) · p.15 입면도 ..." (길이 상한) */
export function formatDrawingIndex(entries: DrawingIndexEntry[], maxLength = 1400): string {
  if (entries.length === 0) return "";
  const parts: string[] = [];
  let length = 0;
  for (const entry of entries) {
    const label = `p.${entry.page} ${entry.types.join("·")}${entry.scale ? `(${entry.scale})` : ""}`;
    if (length + label.length > maxLength) break;
    parts.push(label);
    length += label.length + 3;
  }
  return parts.join(" · ");
}

/**
 * 항목 원문에서 주제를 읽어 우선 확인할 도면 페이지를 고른다 (심화 판독용).
 * 매핑 순서 = 우선순위. 일치하는 도면이 없으면 빈 배열 — 호출부는 기존
 * 키워드 방식으로 폴백한다.
 */
export function selectDrawingPagesForItem(
  itemText: string,
  entries: DrawingIndexEntry[],
  limit = 3,
): Array<{ fileName: string; page: number }> {
  const wantedTypes: string[] = [];
  for (const { pattern, types } of TOPIC_TO_DRAWING_TYPES) {
    if (!pattern.test(itemText)) continue;
    for (const type of types) if (!wantedTypes.includes(type)) wantedTypes.push(type);
  }
  if (wantedTypes.length === 0) return [];

  // 원하는 유형 순서대로 페이지 수집 (중복 제거)
  const picked: Array<{ fileName: string; page: number }> = [];
  const seen = new Set<string>();
  for (const type of wantedTypes) {
    for (const entry of entries) {
      if (!entry.types.includes(type)) continue;
      const key = `${entry.fileName}#${entry.page}`;
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push({ fileName: entry.fileName, page: entry.page });
      if (picked.length >= limit) return picked;
    }
  }
  return picked;
}
