import type { UploadedFileSummary } from "@/lib/ai/uploaded-file";
import { renderPageTiles } from "@/lib/pdf/render-page";
import type { EvaluationContext } from "@/lib/evaluation-context";
import { callClaude, type ClaudeContentBlock } from "./claude-call";
import { EVALUATE_SYSTEM_PROMPT, parsePayload, sanitizeFindings } from "./evaluate-items";
import { estimateVisionPagesUsd } from "./budget";
import type { ChecklistFinding, ChecklistItem } from "./types";
import { addUsage, type UsageByModel } from "./usage-cost";

/**
 * 선별 줌 — 1차 평가에서 판독이 불충분했던 항목(확인불가·부분충족)의 근거 페이지를
 * 고해상도 타일로 다시 보여주고 그 항목들만 재판정합니다.
 *
 * 비용 통제: 전체 문서를 고해상도로 보내는 대신 "판독에 실패한 페이지"만 확대합니다.
 * 페이지당 4타일 ≈ 8천 토큰(약 $0.024)이며, 페이지 수 상한과 남은 예산·남은 시간을
 * 모두 지킬 때만 실행됩니다.
 */

/** 줌 대상 페이지 상한 (4타일/페이지) */
const MAX_ZOOM_PAGES = 8;
/** 줌 재판정 항목 상한 (출력 토큰 한도 내) */
const MAX_ZOOM_ITEMS = 15;
/** 줌 실행에 필요한 최소 남은 시간(ms) — 렌더링+호출 여유 */
const MIN_REMAINING_MS_FOR_ZOOM = 75_000;

export type ZoomTarget = {
  fileName: string;
  page: number;
  itemIds: string[];
};

/**
 * 줌 대상 선정: 확인불가·부분충족 판정 중 근거 페이지가 있는 항목들을 페이지별로 묶고,
 * 실패 항목이 많이 걸린 페이지 순으로 상한까지 선택합니다.
 * (근거 페이지가 전혀 없는 확인불가 항목은 확대할 위치를 알 수 없어 제외)
 */
export function selectZoomTargets(
  items: ChecklistItem[],
  findings: ChecklistFinding[],
  maxPages: number = MAX_ZOOM_PAGES,
): ZoomTarget[] {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const byPage = new Map<string, ZoomTarget>();

  for (const finding of findings) {
    if (finding.status !== "확인불가" && finding.status !== "부분충족") continue;
    if (finding.zoomAttempted) continue; // 이미 확대 판독을 시도한 항목 — 반복 과금 방지
    if (!itemById.has(finding.itemId)) continue;

    const pages = finding.evidence.map((entry) => ({ fileName: entry.fileName, page: entry.page }));
    // 근거가 없으면 항목 출처 페이지(체크리스트 표 위치)는 확대 가치가 없어 제외
    for (const ref of pages) {
      if (!ref.fileName || !Number.isFinite(ref.page) || ref.page < 1) continue;
      const key = `${ref.fileName}#${ref.page}`;
      const target = byPage.get(key) ?? { fileName: ref.fileName, page: ref.page, itemIds: [] };
      if (!target.itemIds.includes(finding.itemId)) target.itemIds.push(finding.itemId);
      byPage.set(key, target);
    }
  }

  return [...byPage.values()]
    .sort((left, right) => right.itemIds.length - left.itemIds.length)
    .slice(0, maxPages);
}

function buildZoomPrompt(zoomItems: ChecklistItem[], pages: Array<{ fileName: string; page: number }>): string {
  const itemsText = zoomItems
    .map((item) => `- id:${item.id} ${item.category ? `[${item.category}] ` : ""}${item.text}`)
    .join("\n");
  const pageList = pages.map((page) => `p.${page.page}`).join(", ");

  return `아래 항목들은 1차 검토에서 도면·문자 판독이 불충분해 "확인불가" 또는 "부분충족"으로 판정된 항목입니다.
첨부된 이미지는 해당 근거 페이지(${pageList})를 고해상도로 확대해 4분할(좌상/우상/좌하/우하)한 것입니다.
확대본에서 치수·범례·표기를 다시 판독해 이 항목들만 재판정하세요.

규칙:
- 페이지 인용은 각 이미지 앞에 안내된 "원본 p.N"의 N을 그대로 기재하세요.
- 확대본에서도 판독되지 않으면 기존 판정(확인불가/부분충족)을 유지하세요. 추측 금지.
- 확대본에 없는 페이지의 내용은 언급하지 마세요.
- 근거를 확인한 위치를 evidence의 region에 기재하세요: 그 근거가 보이는 "타일"(좌상/우상/좌하/우하)과, 그 타일 이미지 안에서의 정규화 좌표(x,y=좌상단 원점, width,height, 각 0~1). 위치가 불확실하면 region을 생략하세요.

[재판정 대상 항목]
${itemsText}

출력 형식(JSON만):
{"findings":[{"itemId":"c1","status":"충족|부분충족|미충족|확인불가","rationale":"판단 근거","evidence":[{"fileName":"파일명","page":3,"note":"확인 내용","region":{"tile":"좌상","x":0.2,"y":0.5,"width":0.3,"height":0.1}}],"lawRefs":[],"recommendation":"보완 방향(미충족·부분충족 시)"}]}`;
}

/** 타일(2x2 분할) 기준 정규화 좌표 -> 원본 페이지 기준 정규화 좌표 변환 */
export function tileRegionToPageRegion(region: {
  tile?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}): { x: number; y: number; width: number; height: number } | undefined {
  const offsets: Record<string, { x: number; y: number }> = {
    좌상: { x: 0, y: 0 },
    우상: { x: 0.5, y: 0 },
    좌하: { x: 0, y: 0.5 },
    우하: { x: 0.5, y: 0.5 },
  };
  const x = Number(region.x);
  const y = Number(region.y);
  const width = Number(region.width);
  const height = Number(region.height);
  if (![x, y, width, height].every((value) => Number.isFinite(value))) return undefined;

  const offset = offsets[String(region.tile ?? "").trim()];
  // 타일 표기가 없으면 이미 페이지 기준 좌표로 간주 (안전한 폴백)
  if (!offset) return { x, y, width, height };

  return {
    x: offset.x + x * 0.5,
    y: offset.y + y * 0.5,
    width: width * 0.5,
    height: height * 0.5,
  };
}

export type ZoomReviewResult = {
  /** 재판정된 판정 (itemId 기준으로 기존 판정을 대체) */
  findings: ChecklistFinding[];
  /** 확대 재판독을 시도한 항목 id — 재판독 후에도 미해결이면 "확인 필요" 표시에 사용 */
  attemptedItemIds: string[];
  zoomedPages: number;
  zoomedItems: number;
  usageByModel: UsageByModel;
};

export async function runZoomReview(options: {
  files: UploadedFileSummary[];
  items: ChecklistItem[];
  findings: ChecklistFinding[];
  context: EvaluationContext;
  getRemainingBudgetMs: () => number;
  remainingBudgetUsd: number;
}): Promise<ZoomReviewResult | null> {
  const { files, items, findings, context } = options;
  const usageByModel: UsageByModel = new Map();

  if (options.getRemainingBudgetMs() < MIN_REMAINING_MS_FOR_ZOOM) {
    console.log("[checklist-review] zoom 생략 — 남은 시간 부족");
    return null;
  }

  // 예산 내 페이지 수: 페이지당 4타일 입력 비용으로 환산
  const affordablePages = Math.floor(options.remainingBudgetUsd / estimateVisionPagesUsd(4));
  const maxPages = Math.min(MAX_ZOOM_PAGES, affordablePages);
  if (maxPages < 1) {
    console.log(`[checklist-review] zoom 생략 — 남은 예산 부족 ($${options.remainingBudgetUsd.toFixed(2)})`);
    return null;
  }

  const targets = selectZoomTargets(items, findings, maxPages);
  if (targets.length === 0) return null;

  // 대상 항목 (상한 내)
  const targetItemIds = new Set<string>();
  for (const target of targets) {
    for (const id of target.itemIds) {
      if (targetItemIds.size >= MAX_ZOOM_ITEMS) break;
      targetItemIds.add(id);
    }
  }
  const zoomItems = items.filter((item) => targetItemIds.has(item.id));
  if (zoomItems.length === 0) return null;

  // 페이지 렌더링 (파일별 base64는 visionAssets의 PDF에서)
  const blocks: ClaudeContentBlock[] = [];
  let renderedPages = 0;
  for (const target of targets) {
    const file = files.find((entry) => entry.originalName === target.fileName);
    const pdfAsset = file?.visionAssets?.find((asset) => asset.mediaType === "application/pdf");
    if (!pdfAsset) continue;

    const tiles = await renderPageTiles(pdfAsset.base64, target.page);
    if (!tiles) continue;

    renderedPages += 1;
    blocks.push({
      type: "text",
      text: `── 원본 p.${target.page} 고해상도 확대 (아래 4개 이미지: 좌상/우상/좌하/우하 순) ──`,
    });
    for (const tile of tiles) {
      blocks.push({ type: "image", source: { type: "base64", media_type: "image/png", data: tile.base64 } });
    }
  }
  if (renderedPages === 0) return null;

  const prompt = buildZoomPrompt(
    zoomItems,
    targets.map((target) => ({ fileName: target.fileName, page: target.page })),
  );

  const result = await callClaude({
    system: EVALUATE_SYSTEM_PROMPT,
    userBlocks: [...blocks, { type: "text", text: prompt }],
    maxOutputTokens: Math.min(16_384, 1_500 + zoomItems.length * 480),
    includesPdf: false,
    timeoutMs: Math.max(30_000, Math.min(options.getRemainingBudgetMs() - 10_000, 120_000)),
  });
  addUsage(usageByModel, result.model, result.usage);

  const attemptedItemIds = zoomItems.map((item) => item.id);
  const parsed = parsePayload(result.text);
  if (parsed?.findings) {
    for (const finding of parsed.findings) {
      for (const evidence of finding?.evidence ?? []) {
        const region = evidence?.region as
          | { tile?: string; x?: number; y?: number; width?: number; height?: number }
          | undefined;
        if (region) evidence.region = tileRegionToPageRegion(region);
      }
    }
  }
  if (!parsed) {
    console.warn("[checklist-review] zoom 응답 해석 실패 — 1차 판정 유지");
    return { findings: [], attemptedItemIds, zoomedPages: renderedPages, zoomedItems: 0, usageByModel };
  }

  const sanitized = sanitizeFindings(parsed.findings ?? [], zoomItems, context, files);
  console.log(
    `[checklist-review] zoom pages=${renderedPages} items=${zoomItems.length} refined=${sanitized.length}`,
  );
  return { findings: sanitized, attemptedItemIds, zoomedPages: renderedPages, zoomedItems: sanitized.length, usageByModel };
}
