import { CLAUDE_FAST_MODEL } from "@/lib/ai/claude-models";
import { parsePageSlices } from "@/lib/ai/page-citation";
import type { UploadedFileSummary } from "@/lib/ai/uploaded-file";
import { formatOcrLinesForText, type OcrLine } from "@/lib/pdf/ocr-locate";
import { openPdfForRender } from "@/lib/pdf/render-page";
import { isR2Configured, r2GetObject, r2PutObject } from "@/lib/r2-storage";
import { callClaude, type ClaudeContentBlock, type ClaudeUsage } from "./claude-call";

/**
 * 도면 정밀 판독 — ① 페이지 유형 자동 분류 + ② 스캔 도면 OCR(글자+위치).
 *
 * 배경: 심의도서의 도면 페이지는 대부분 스캔 이미지라 텍스트층에 표제·주기 몇 줄만
 * 있고 실명·치수·라벨은 그림 속에 있다(강하 도서 실측: 도면 페이지 100~400자).
 * 평가 AI는 PDF를 축소 이미지로만 보므로 작은 글씨를 못 읽고, 글자 좌표 기반 근거
 * 박스·수치 검증도 텍스트층이 없어 도면에서는 작동하지 않았다.
 *
 * 처리:
 * 1) 분류 — 텍스트층이 빈약한 페이지만 저해상도로 렌더링해 흰 바탕 비율·채도로
 *    "도면"과 "사진·투시도"를 가른다 (비용 0). 사진은 OCR하지 않는다(통째로 보는 게 낫다).
 * 2) 적응형 타일 — 도면 크기에 따라 2×2(A3 이하) / 3×3(A2 이상)으로 나누고, 경계에서
 *    글자가 잘리지 않게 겹치게 자르며, 빈 타일(여백)은 건너뛴다.
 * 3) OCR — 타일들을 경량 모델에 한 번에 보내 글자와 위치(타일 기준 좌표)를 받는다.
 * 4) 좌표 보정 — AI가 준 근사 박스를 실제 잉크 픽셀에 맞춰 조인다(snap). 보정에 성공한
 *    줄만 "정밀"로 표시해, 화면의 빨간 박스는 정밀 좌표일 때만 그린다.
 * 5) 캐시 — 페이지 내용 해시(재제출 시 바뀌지 않은 페이지 재사용)와 파일 해시(캡처
 *    조회 경로용) 두 키로 R2에 저장. 같은 페이지는 다시 판독하지 않는다.
 */

export type PageKind = "drawing" | "photo";

type CachedOcrPage = { kind: PageKind; grid: number; lines: OcrLine[] };

const OCR_VERSION = "v1";
/** 이 글자 수 미만이면 "그림 위주 페이지"로 보고 분류 대상 */
const MAX_TEXT_CHARS_FOR_SCAN = 600;
/** 분석 1회당 새로 판독하는 최대 페이지 수 (캐시 적중은 무제한) */
const MAX_OCR_PAGES = 24;
const OCR_CONCURRENCY = 6;
/** 타일 한 장의 목표 긴 변(px) — 모델 입력 해상도 상한(~1,568px) 근처 */
const TILE_TARGET_PX = 1_450;
/** 타일 겹침 비율 — 경계에 걸친 글자 보호 */
const TILE_OVERLAP = 0.04;
/** 이 이하 잉크 비율 타일은 여백으로 보고 건너뜀 */
const MIN_TILE_INK_RATIO = 0.004;
/** 잉크(어두운 픽셀) 판정 임계 (0~255 회색조) */
const INK_THRESHOLD = 150;
/** 경량 모델 단가 ($/token) — 예산 계산용 */
const FAST_INPUT_USD = 1 / 1_000_000;
const FAST_OUTPUT_USD = 5 / 1_000_000;

function pageCacheKey(pageHash: string): string {
  return `ocr/page/${pageHash}-${OCR_VERSION}.json`;
}
export function fileOcrCacheKey(contentHash: string, page: number): string {
  return `ocr/file/${contentHash}/p${page}-${OCR_VERSION}.json`;
}

async function readCache(key: string): Promise<CachedOcrPage | null> {
  if (!isR2Configured()) return null;
  try {
    const body = await r2GetObject(key);
    if (!body) return null;
    const parsed = JSON.parse(body.toString("utf8")) as CachedOcrPage;
    return Array.isArray(parsed?.lines) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeCache(keys: string[], value: CachedOcrPage): Promise<void> {
  if (!isR2Configured()) return;
  const body = Buffer.from(JSON.stringify(value));
  await Promise.all(keys.map((key) => r2PutObject(key, body, "application/json").catch(() => undefined)));
}

/** 캡처 조회 경로(evidence-snippet)용 — 파일 해시로 페이지 OCR 줄 조회 */
export async function readFileOcrLines(contentHash: string, page: number): Promise<OcrLine[] | null> {
  const cached = await readCache(fileOcrCacheKey(contentHash, page));
  return cached && cached.lines.length > 0 ? cached.lines : null;
}

/** 회색조 버퍼 */
type Gray = { data: Uint8Array; width: number; height: number };

function toGray(rgba: Uint8ClampedArray, width: number, height: number): Gray {
  const data = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < data.length; i += 4, p += 1) {
    // 투명 픽셀은 흰색으로 취급
    const a = rgba[i + 3] / 255;
    const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    data[p] = Math.round(lum * a + 255 * (1 - a));
  }
  return { data, width, height };
}

/** 저해상도 렌더로 도면/사진 판별 — 흰 바탕 비율과 평균 채도 */
export function classifyRgba(rgba: Uint8ClampedArray): PageKind {
  let white = 0;
  let satSum = 0;
  let satCount = 0;
  const pixels = rgba.length / 4;
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (min > 232) {
      white += 1;
      continue;
    }
    satSum += max === 0 ? 0 : (max - min) / max;
    satCount += 1;
  }
  const whiteRatio = white / Math.max(pixels, 1);
  const meanSat = satCount > 0 ? satSum / satCount : 0;
  // 도면: 흰 바탕이 넓음. 채색 도면(조경 등)은 흰 바탕이 줄어도 채도가 낮은 편.
  if (whiteRatio >= 0.45) return "drawing";
  if (whiteRatio >= 0.28 && meanSat < 0.2) return "drawing";
  return "photo";
}

function inkRatio(gray: Gray, x0: number, y0: number, x1: number, y1: number): number {
  let ink = 0;
  let total = 0;
  for (let y = y0; y < y1; y += 3) {
    const row = y * gray.width;
    for (let x = x0; x < x1; x += 3) {
      total += 1;
      if (gray.data[row + x] < INK_THRESHOLD) ink += 1;
    }
  }
  return total > 0 ? ink / total : 0;
}

/**
 * 근사 박스를 실제 잉크에 맞춰 조인다. 주변을 조금 넓혀 잉크 경계를 찾되, 박스를 가로지르는
 * 긴 선(벽선·치수선)은 행/열 단위로 제외한다. 결과가 원래 박스와 크게 다르면 실패(정밀 아님).
 */
export function snapBoxToInk(
  gray: Gray,
  box: { x0: number; y0: number; x1: number; y1: number },
): { x0: number; y0: number; x1: number; y1: number } | null {
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  if (bw < 4 || bh < 4) return null;
  const margin = Math.max(6, Math.round(bh * 0.6));
  const ex0 = Math.max(0, Math.floor(box.x0 - margin));
  const ey0 = Math.max(0, Math.floor(box.y0 - margin));
  const ex1 = Math.min(gray.width, Math.ceil(box.x1 + margin));
  const ey1 = Math.min(gray.height, Math.ceil(box.y1 + margin));
  const ew = ex1 - ex0;
  const eh = ey1 - ey0;
  if (ew < 4 || eh < 4) return null;

  const rowInk = new Uint32Array(eh);
  const colInk = new Uint32Array(ew);
  for (let y = 0; y < eh; y += 1) {
    const row = (ey0 + y) * gray.width;
    for (let x = 0; x < ew; x += 1) {
      if (gray.data[row + ex0 + x] < INK_THRESHOLD) {
        rowInk[y] += 1;
        colInk[x] += 1;
      }
    }
  }
  // 긴 선 = 확장 영역을 거의 가로지르는 행/열
  const lineRow = (y: number) => rowInk[y] > ew * 0.8;
  const lineCol = (x: number) => colInk[x] > eh * 0.8;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < eh; y += 1) {
    if (lineRow(y)) continue;
    const row = (ey0 + y) * gray.width;
    for (let x = 0; x < ew; x += 1) {
      if (lineCol(x)) continue;
      if (gray.data[row + ex0 + x] < INK_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!Number.isFinite(minX)) return null;
  const snapped = { x0: ex0 + minX, y0: ey0 + minY, x1: ex0 + maxX + 1, y1: ey0 + maxY + 1 };
  const sw = snapped.x1 - snapped.x0;
  const sh = snapped.y1 - snapped.y0;
  // 형태가 원래 박스와 크게 다르면(주변 선·글자를 끌어옴) 보정 실패로 본다
  if (sh > bh * 2.2 || sh < bh * 0.3 || sw > bw * 1.8 || sw < bw * 0.35) return null;
  const ix = Math.max(0, Math.min(snapped.x1, box.x1) - Math.max(snapped.x0, box.x0));
  const iy = Math.max(0, Math.min(snapped.y1, box.y1) - Math.max(snapped.y0, box.y0));
  const inter = ix * iy;
  const unionArea = sw * sh + bw * bh - inter;
  if (unionArea <= 0 || inter / unionArea < 0.3) return null;
  return snapped;
}

const OCR_SYSTEM = `당신은 건축·경관 도면 전용 OCR 엔진입니다. 주어진 도면 타일 이미지들에서 읽을 수 있는 글자를 원문 그대로 옮기고 위치를 표시합니다.
규칙:
- 실명·라벨·치수·레벨·주기·범례·표제란·표 안의 글자를 모두 옮깁니다. 한 줄(또는 라벨 하나)이 한 항목입니다.
- 숫자·단위·기호는 보이는 그대로 적습니다 (예: "3,600", "EL+12.50", "1/300", "H=15.0m").
- 흐려서 확실하지 않은 글자는 빼고, 절대 추측하지 않습니다.
- 좌표는 그 타일 이미지 기준 0~1000 정수 [x0,y0,x1,y1]로, 글자를 꼭 맞게 감쌉니다.
- 선·해치·기호·그림은 무시합니다. 회전된 글자도 읽습니다.
- JSON만 출력합니다: {"tiles":{"T1":[["글자",x0,y0,x1,y1],...],"T2":[...]}}`;

function parseOcrJson(text: string): Record<string, unknown[]> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { tiles?: Record<string, unknown[]> };
    return parsed.tiles && typeof parsed.tiles === "object" ? parsed.tiles : null;
  } catch {
    return null;
  }
}

type TileRect = { label: string; x: number; y: number; w: number; h: number };

function buildTileRects(width: number, height: number, grid: number): TileRect[] {
  const rects: TileRect[] = [];
  const ovX = Math.round((width / grid) * TILE_OVERLAP * grid);
  const ovY = Math.round((height / grid) * TILE_OVERLAP * grid);
  let n = 1;
  for (let r = 0; r < grid; r += 1) {
    for (let c = 0; c < grid; c += 1) {
      const x0 = Math.max(0, Math.floor((c * width) / grid) - ovX);
      const y0 = Math.max(0, Math.floor((r * height) / grid) - ovY);
      const x1 = Math.min(width, Math.ceil(((c + 1) * width) / grid) + ovX);
      const y1 = Math.min(height, Math.ceil(((r + 1) * height) / grid) + ovY);
      rects.push({ label: `T${n}`, x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      n += 1;
    }
  }
  return rects;
}

type PdfHandle = Awaited<ReturnType<typeof openPdfForRender>>;

async function ocrSinglePage(
  handle: PdfHandle,
  pageNumber: number,
): Promise<{ result: CachedOcrPage; usage?: ClaudeUsage; model?: string }> {
  const { pdf, canvasModule, renderPage } = handle;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const longEdgePt = Math.max(viewport.width, viewport.height);

  // ① 분류 — 긴 변 360px 저해상도
  const small = await renderPage(pageNumber, Math.max(0.1, 360 / longEdgePt));
  const smallCanvas = canvasModule.createCanvas(small.width, small.height);
  const smallCtx = smallCanvas.getContext("2d");
  smallCtx.fillStyle = "#ffffff";
  smallCtx.fillRect(0, 0, small.width, small.height);
  smallCtx.drawImage(small, 0, 0);
  const kind = classifyRgba(smallCtx.getImageData(0, 0, small.width, small.height).data);
  if (kind === "photo") return { result: { kind, grid: 0, lines: [] } };

  // ② 적응형 타일 — A2 이상(긴 변 ≥ 1,400pt)은 3×3, 그 이하는 2×2
  const grid = longEdgePt >= 1_400 ? 3 : 2;
  const scale = Math.min(8, (grid * TILE_TARGET_PX) / longEdgePt);
  const image = await renderPage(pageNumber, scale);
  const canvas = canvasModule.createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, image.width, image.height);
  ctx.drawImage(image, 0, 0);
  const gray = toGray(ctx.getImageData(0, 0, image.width, image.height).data, image.width, image.height);

  const rects = buildTileRects(image.width, image.height, grid).filter(
    (rect) => inkRatio(gray, rect.x, rect.y, rect.x + rect.w, rect.y + rect.h) >= MIN_TILE_INK_RATIO,
  );
  if (rects.length === 0) return { result: { kind, grid, lines: [] } };

  const blocks: ClaudeContentBlock[] = [];
  for (const rect of rects) {
    const tile = canvasModule.createCanvas(rect.w, rect.h);
    const tctx = tile.getContext("2d");
    tctx.drawImage(canvas, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
    const encoded = await tile.encode("jpeg", 85);
    blocks.push({ type: "text", text: `[${rect.label}]` });
    blocks.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: Buffer.from(encoded).toString("base64") },
    });
  }
  blocks.push({ type: "text", text: "위 타일들의 글자를 규칙대로 JSON으로 출력하세요." });

  // ③ OCR
  const response = await callClaude({
    system: OCR_SYSTEM,
    userBlocks: blocks,
    maxOutputTokens: 8_000,
    model: CLAUDE_FAST_MODEL,
    timeoutMs: 60_000,
  });
  const tiles = parseOcrJson(response.text);
  if (!tiles) {
    console.warn(`[drawing-ocr] p.${pageNumber} 응답 파싱 실패 (stop=${response.stopReason ?? "?"})`);
    return { result: { kind, grid, lines: [] }, usage: response.usage, model: response.model };
  }

  // ④ 좌표 변환 + 잉크 보정 + 겹침 영역 중복 제거
  const lines: OcrLine[] = [];
  const rectByLabel = new Map(rects.map((rect) => [rect.label, rect]));
  for (const [label, entries] of Object.entries(tiles)) {
    const rect = rectByLabel.get(label);
    if (!rect || !Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length < 5) continue;
      const text = String(entry[0] ?? "").trim();
      const coords = entry.slice(1, 5).map(Number);
      if (!text || coords.some((value) => !Number.isFinite(value))) continue;
      const [a, b, c, d] = coords.map((value) => Math.min(1000, Math.max(0, value)));
      const approx = {
        x0: rect.x + (Math.min(a, c) / 1000) * rect.w,
        y0: rect.y + (Math.min(b, d) / 1000) * rect.h,
        x1: rect.x + (Math.max(a, c) / 1000) * rect.w,
        y1: rect.y + (Math.max(b, d) / 1000) * rect.h,
      };
      const snapped = snapBoxToInk(gray, approx);
      const box = snapped ?? approx;
      const line: OcrLine = {
        t: text.slice(0, 120),
        x: box.x0 / image.width,
        y: box.y0 / image.height,
        w: (box.x1 - box.x0) / image.width,
        h: (box.y1 - box.y0) / image.height,
        s: snapped ? 1 : 0,
      };
      const duplicate = lines.some(
        (other) =>
          other.t === line.t &&
          Math.abs(other.x + other.w / 2 - (line.x + line.w / 2)) < 0.015 &&
          Math.abs(other.y + other.h / 2 - (line.y + line.h / 2)) < 0.015,
      );
      if (!duplicate) lines.push(line);
    }
  }
  return { result: { kind, grid, lines }, usage: response.usage, model: response.model };
}

export type DrawingOcrStats = {
  candidates: number;
  cached: number;
  ocrPages: number;
  photoPages: number;
  lines: number;
  preciseLines: number;
  skipped: number;
};

/**
 * 파일들의 그림 위주 페이지를 분류·판독한다. 결과는 fileId → (페이지 → 판독 줄) 맵.
 * 시간·예산을 넘기면 남은 페이지는 건너뛴다(평가는 기존 방식으로 진행 — 실패해도 무해).
 */
export async function runDrawingOcr(options: {
  files: UploadedFileSummary[];
  fileBuffers: Map<string, Buffer>;
  deadlineAt: number;
  maxUsd: number;
  onUsage: (model: string, usage?: ClaudeUsage) => void;
}): Promise<{ byFileId: Map<string, Map<number, OcrLine[]>>; stats: DrawingOcrStats }> {
  const { files, fileBuffers, deadlineAt, maxUsd, onUsage } = options;
  const byFileId = new Map<string, Map<number, OcrLine[]>>();
  const stats: DrawingOcrStats = {
    candidates: 0,
    cached: 0,
    ocrPages: 0,
    photoPages: 0,
    lines: 0,
    preciseLines: 0,
    skipped: 0,
  };
  let spentUsd = 0;
  let newOcrCount = 0;

  for (const file of files) {
    const fileId = file.id;
    if (!fileId) continue;
    const buffer = fileBuffers.get(fileId);
    const totalPages = file.totalPages ?? 0;
    if (!buffer || totalPages < 1) continue;

    // 텍스트층이 빈약한 페이지만 후보
    const textByPage = new Map<number, number>();
    for (const slice of parsePageSlices([file])) textByPage.set(slice.page, slice.text.length);
    const candidates: number[] = [];
    for (let page = 1; page <= totalPages; page += 1) {
      if ((textByPage.get(page) ?? 0) < MAX_TEXT_CHARS_FOR_SCAN) candidates.push(page);
    }
    stats.candidates += candidates.length;
    if (candidates.length === 0) continue;

    const pageMap = new Map<number, OcrLine[]>();
    byFileId.set(fileId, pageMap);
    const record = (page: number, result: CachedOcrPage) => {
      if (result.kind === "photo") stats.photoPages += 1;
      if (result.lines.length > 0) {
        pageMap.set(page, result.lines);
        stats.lines += result.lines.length;
        stats.preciseLines += result.lines.filter((line) => line.s === 1).length;
      }
    };

    // 캐시 우선 — 페이지 해시(재제출 재사용) → 파일 해시
    const uncached: number[] = [];
    await Promise.all(
      candidates.map(async (page) => {
        const pageHash = file.pageHashes?.[page - 1];
        const cached =
          (pageHash ? await readCache(pageCacheKey(pageHash)) : null) ??
          (file.contentHash ? await readCache(fileOcrCacheKey(file.contentHash, page)) : null);
        if (cached) {
          stats.cached += 1;
          record(page, cached);
          // 파일 키가 없으면 보충 (캡처 조회 경로에서 찾을 수 있게)
          if (file.contentHash) void writeCache([fileOcrCacheKey(file.contentHash, page)], cached);
        } else {
          uncached.push(page);
        }
      }),
    );
    uncached.sort((a, b) => a - b);
    if (uncached.length === 0) continue;

    let handle: PdfHandle;
    try {
      handle = await openPdfForRender(new Uint8Array(buffer));
    } catch (error) {
      console.warn("[drawing-ocr] PDF 열기 실패:", error instanceof Error ? error.message : error);
      stats.skipped += uncached.length;
      continue;
    }

    let cursor = 0;
    const worker = async () => {
      while (cursor < uncached.length) {
        const page = uncached[cursor];
        cursor += 1;
        if (
          Date.now() > deadlineAt ||
          spentUsd >= maxUsd ||
          newOcrCount >= MAX_OCR_PAGES
        ) {
          stats.skipped += 1;
          continue;
        }
        newOcrCount += 1;
        try {
          const { result, usage, model } = await ocrSinglePage(handle, page);
          if (usage && model) {
            onUsage(model, usage);
            spentUsd +=
              (usage.inputTokens + usage.cacheCreationInputTokens) * FAST_INPUT_USD +
              usage.outputTokens * FAST_OUTPUT_USD;
          }
          if (result.kind === "drawing") stats.ocrPages += 1;
          record(page, result);
          const keys: string[] = [];
          const pageHash = file.pageHashes?.[page - 1];
          if (pageHash) keys.push(pageCacheKey(pageHash));
          if (file.contentHash) keys.push(fileOcrCacheKey(file.contentHash, page));
          await writeCache(keys, result);
        } catch (error) {
          stats.skipped += 1;
          console.warn(`[drawing-ocr] p.${page} 판독 실패:`, error instanceof Error ? error.message : error);
        }
      }
    };
    await Promise.all(Array.from({ length: OCR_CONCURRENCY }, worker));
  }

  return { byFileId, stats };
}

/**
 * 판독 결과를 각 파일의 페이지 표시 텍스트(--- 「파일」 p.N ---)에 덧붙인다 —
 * 관련 페이지 선별·평가 프롬프트·수치 검증·도면 목차가 모두 이 텍스트를 쓰므로,
 * 여기 한 곳에서 합치면 도면 속 글자가 파이프라인 전체에 반영된다.
 */
export function mergeOcrIntoFiles(
  files: UploadedFileSummary[],
  byFileId: Map<string, Map<number, OcrLine[]>>,
): void {
  for (const file of files) {
    const pageMap = file.id ? byFileId.get(file.id) : undefined;
    if (!pageMap || pageMap.size === 0) continue;
    const slices = parsePageSlices([file]);
    const textByPage = new Map<number, string>();
    for (const slice of slices) textByPage.set(slice.page, slice.text);
    for (const [page, lines] of pageMap) {
      const ocrText = formatOcrLinesForText(lines);
      if (!ocrText) continue;
      const base = textByPage.get(page) ?? "";
      textByPage.set(page, `${base}${base ? "\n" : ""}[도면 판독 텍스트] ${ocrText}`);
    }
    const fileName = slices[0]?.fileName ?? file.originalName;
    file.extractedTextPreview = [...textByPage.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([page, text]) => `--- 「${fileName}」 p.${page} ---\n${text}`)
      .join("\n\n");
  }
}
