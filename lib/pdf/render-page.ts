/**
 * PDF 페이지를 고해상도로 렌더링하고 2x2 타일로 분할합니다 — 선별 줌(판독 실패 항목의
 * 근거 페이지 확대 재판독)용. Anthropic API는 이미지를 긴 변 ~1,568px로 축소하므로
 * 도면 전체를 한 장으로 보내면 치수 문자가 뭉개집니다. 고해상도로 렌더링한 뒤 4분할하면
 * 타일당 유효 해상도가 약 2배가 되어 치수·범례 판독률이 올라갑니다.
 */

/**
 * 전체 페이지 렌더링의 긴 변 목표(px). Anthropic API는 이미지를 긴 변 ~1,568px로
 * 처리하므로 타일(절반)이 그 근처가 되도록 잡는다 — 그 이상은 판독률 이득 없이
 * 요청 용량만 커진다 (8페이지×4타일 PNG가 요청 한도를 초과했던 실측 사례 반영).
 */
const TARGET_PAGE_LONG_EDGE = 3_200;
/** JPEG 품질 — 도면(선·문자)은 80이면 판독에 충분하면서 PNG 대비 수 배 작음 */
const JPEG_QUALITY = 80;

export type PageTile = {
  /** 사람이 읽는 위치 라벨 (좌상/우상/좌하/우하) */
  label: string;
  /** JPEG base64 */
  base64: string;
  mediaType: "image/jpeg";
};

export async function renderPageTiles(pdfBase64: string, pageNumber: number): Promise<PageTile[] | null> {
  try {
    const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
    const canvasModule = await import("@napi-rs/canvas");

    // unpdf에 번들된 pdf.js의 기본 NodeCanvasFactory는 고장난 스텁이라(호출 즉시
    // "@napi-rs/canvas is not available in this environment"를 던짐) 패턴·마스크가
    // 있는 복잡한 도면 페이지 렌더링이 실패한다 — 정상 동작하는 팩토리를 문서에 주입.
    class NapiCanvasFactory {
      // pdf.js BaseCanvasFactory 생성자 시그니처 호환용 (인자 무시)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_options?: unknown) {}
      create(width: number, height: number) {
        const canvas = canvasModule.createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
        return { canvas, context: canvas.getContext("2d") };
      }
      reset(entry: { canvas: { width: number; height: number } }, width: number, height: number) {
        entry.canvas.width = Math.max(1, Math.ceil(width));
        entry.canvas.height = Math.max(1, Math.ceil(height));
      }
      destroy(entry: { canvas: { width: number; height: number } | null; context: unknown }) {
        if (entry.canvas) {
          entry.canvas.width = 0;
          entry.canvas.height = 0;
        }
        entry.canvas = null;
        entry.context = null;
      }
    }

    const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(pdfBase64, "base64")), {
      CanvasFactory: NapiCanvasFactory,
    } as never);
    if (pageNumber < 1 || pageNumber > pdf.numPages) return null;

    // 페이지 크기를 확인해 긴 변 상한 내 최대 배율 결정
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const longEdge = Math.max(viewport.width, viewport.height);
    const scale = Math.max(1, TARGET_PAGE_LONG_EDGE / longEdge);

    const rendered = await renderPageAsImage(pdf, pageNumber, {
      scale,
      canvasImport: () => import("@napi-rs/canvas"),
    });

    const image = await canvasModule.loadImage(Buffer.from(rendered));
    const width = image.width;
    const height = image.height;
    const halfW = Math.ceil(width / 2);
    const halfH = Math.ceil(height / 2);

    const positions: Array<{ label: string; x: number; y: number; w: number; h: number }> = [
      { label: "좌상", x: 0, y: 0, w: halfW, h: halfH },
      { label: "우상", x: width - halfW, y: 0, w: halfW, h: halfH },
      { label: "좌하", x: 0, y: height - halfH, w: halfW, h: halfH },
      { label: "우하", x: width - halfW, y: height - halfH, w: halfW, h: halfH },
    ];

    const tiles: PageTile[] = [];
    for (const pos of positions) {
      const canvas = canvasModule.createCanvas(pos.w, pos.h);
      const ctx = canvas.getContext("2d");
      // JPEG는 알파가 없으므로 흰 배경을 먼저 채움 (투명 영역이 검게 나오는 것 방지)
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, pos.w, pos.h);
      ctx.drawImage(image, pos.x, pos.y, pos.w, pos.h, 0, 0, pos.w, pos.h);
      const encoded = await canvas.encode("jpeg", JPEG_QUALITY);
      tiles.push({ label: pos.label, base64: Buffer.from(encoded).toString("base64"), mediaType: "image/jpeg" });
    }
    return tiles;
  } catch (error) {
    console.warn(
      `[checklist-review] 페이지 렌더링 실패 (p.${pageNumber}):`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/** 크롭 주변 여백 비율 (근거 주변 맥락이 살짝 보이도록) */
const SNIPPET_PADDING_RATIO = 0.15;

/** 스니펫 렌더링 시 전체 페이지 상한(px) — 메모리 보호 (6000px 렌더는 ~100MB RAM) */
const SNIPPET_PAGE_RENDER_CAP = 4_000;

/**
 * 인스턴스당 동시 렌더링 제한 — 결과 화면이 열리면 썸네일 수십 개가 동시에 요청되는데,
 * Fluid Compute에서 한 인스턴스가 여러 요청을 받으면 대형 PDF 렌더링이 겹쳐 메모리
 * 초과(instance killed)로 죽는 실측 사례가 있어 순차화합니다.
 */
const MAX_CONCURRENT_RENDERS = 2;
let activeRenders = 0;
const renderWaiters: Array<() => void> = [];

async function withRenderSlot<T>(fn: () => Promise<T>): Promise<T> {
  while (activeRenders >= MAX_CONCURRENT_RENDERS) {
    await new Promise<void>((resolve) => renderWaiters.push(resolve));
  }
  activeRenders += 1;
  try {
    return await fn();
  } finally {
    activeRenders -= 1;
    renderWaiters.shift()?.();
  }
}

export type RegionSnippet = {
  /** JPEG base64 */
  base64: string;
  mediaType: "image/jpeg";
};

/**
 * 근거 위치(region, 정규화 0~1·좌상단 원점)를 페이지에서 잘라내 빨간 테두리를 그린
 * 캡처 이미지를 만듭니다 — 결과 카드에서 클릭 없이 근거 부위를 바로 보여주는 용도.
 */
export async function renderRegionSnippet(
  /** PDF 바이트 또는 base64 문자열 — 대용량 파일은 바이트를 그대로 넘기는 편이 메모리에 유리 */
  pdfInput: Uint8Array | string,
  pageNumber: number,
  /** 근거 영역 — 없으면 페이지 전체를 캡처(박스 없음) */
  region: { x: number; y: number; width: number; height: number } | null,
  /** 결과 이미지의 긴 변 목표(px) — 카드 썸네일 ~520, 확대 보기 ~1200 */
  targetLongEdge: number = 520,
): Promise<RegionSnippet | null> {
  return withRenderSlot(() => renderRegionSnippetInner(pdfInput, pageNumber, region, targetLongEdge));
}

async function renderRegionSnippetInner(
  pdfInput: Uint8Array | string,
  pageNumber: number,
  region: { x: number; y: number; width: number; height: number } | null,
  targetLongEdge: number,
): Promise<RegionSnippet | null> {
  try {
    const { getDocumentProxy, renderPageAsImage } = await import("unpdf");
    const canvasModule = await import("@napi-rs/canvas");

    class NapiCanvasFactory {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      constructor(_options?: unknown) {}
      create(width: number, height: number) {
        const canvas = canvasModule.createCanvas(Math.max(1, Math.ceil(width)), Math.max(1, Math.ceil(height)));
        return { canvas, context: canvas.getContext("2d") };
      }
      reset(entry: { canvas: { width: number; height: number } }, width: number, height: number) {
        entry.canvas.width = Math.max(1, Math.ceil(width));
        entry.canvas.height = Math.max(1, Math.ceil(height));
      }
      destroy(entry: { canvas: { width: number; height: number } | null; context: unknown }) {
        if (entry.canvas) {
          entry.canvas.width = 0;
          entry.canvas.height = 0;
        }
        entry.canvas = null;
        entry.context = null;
      }
    }

    const pdfBytes =
      typeof pdfInput === "string" ? new Uint8Array(Buffer.from(pdfInput, "base64")) : new Uint8Array(pdfInput);
    const pdf = await getDocumentProxy(pdfBytes, {
      CanvasFactory: NapiCanvasFactory,
    } as never);
    if (pageNumber < 1 || pageNumber > pdf.numPages) return null;

    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });

    // 크롭(근거 영역 또는 페이지 전체)의 긴 변이 목표 크기가 되도록 배율 결정
    const pageLongEdgePt = Math.max(viewport.width, viewport.height);
    const cropLongEdgePt = region
      ? Math.max(region.width * viewport.width, region.height * viewport.height)
      : pageLongEdgePt;
    const scale = Math.min(
      Math.max(0.5, targetLongEdge / Math.max(cropLongEdgePt, 1)),
      SNIPPET_PAGE_RENDER_CAP / pageLongEdgePt,
      6,
    );

    const rendered = await renderPageAsImage(pdf, pageNumber, {
      scale,
      canvasImport: () => import("@napi-rs/canvas"),
    });
    const image = await canvasModule.loadImage(Buffer.from(rendered));

    let cropX = 0;
    let cropY = 0;
    let cropW = image.width;
    let cropH = image.height;
    let boxRect: { x: number; y: number; w: number; h: number } | null = null;

    if (region) {
      // region -> 픽셀 좌표 + 여백
      const rx = region.x * image.width;
      const ry = region.y * image.height;
      const rw = Math.max(8, region.width * image.width);
      const rh = Math.max(8, region.height * image.height);
      const pad = Math.max(24, Math.max(rw, rh) * SNIPPET_PADDING_RATIO);
      cropX = Math.max(0, Math.floor(rx - pad));
      cropY = Math.max(0, Math.floor(ry - pad));
      cropW = Math.min(image.width - cropX, Math.ceil(rw + pad * 2));
      cropH = Math.min(image.height - cropY, Math.ceil(rh + pad * 2));
      boxRect = { x: rx - cropX, y: ry - cropY, w: rw, h: rh };
    }
    if (cropW < 8 || cropH < 8) return null;

    const canvas = canvasModule.createCanvas(cropW, cropH);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cropW, cropH);
    ctx.drawImage(image, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
    if (boxRect) {
      // 근거 영역 빨간 테두리
      ctx.strokeStyle = "rgba(220,38,38,0.9)";
      ctx.lineWidth = Math.max(2, cropW / 300);
      ctx.strokeRect(boxRect.x, boxRect.y, boxRect.w, boxRect.h);
    }

    const encoded = await canvas.encode("jpeg", 78);
    return { base64: Buffer.from(encoded).toString("base64"), mediaType: "image/jpeg" };
  } catch (error) {
    console.warn(
      `[checklist-review] 근거 캡처 렌더링 실패 (p.${pageNumber}):`,
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/** JPEG를 긴 변 기준으로 축소 재인코딩합니다 (썸네일 파생용 — PDF 재파싱 없이). */
export async function downscaleJpeg(base64: string, targetLongEdge: number): Promise<RegionSnippet | null> {
  try {
    const canvasModule = await import("@napi-rs/canvas");
    const image = await canvasModule.loadImage(Buffer.from(base64, "base64"));
    const longEdge = Math.max(image.width, image.height);
    if (longEdge <= targetLongEdge) {
      return { base64, mediaType: "image/jpeg" };
    }
    const scale = targetLongEdge / longEdge;
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = canvasModule.createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0, width, height);
    const encoded = await canvas.encode("jpeg", 78);
    return { base64: Buffer.from(encoded).toString("base64"), mediaType: "image/jpeg" };
  } catch (error) {
    console.warn("[checklist-review] 썸네일 축소 실패:", error instanceof Error ? error.message : error);
    return null;
  }
}
