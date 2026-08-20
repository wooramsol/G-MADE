/**
 * PDF 페이지를 고해상도로 렌더링하고 2x2 타일로 분할합니다 — 선별 줌(판독 실패 항목의
 * 근거 페이지 확대 재판독)용. Anthropic API는 이미지를 긴 변 ~1,568px로 축소하므로
 * 도면 전체를 한 장으로 보내면 치수 문자가 뭉개집니다. 고해상도로 렌더링한 뒤 4분할하면
 * 타일당 유효 해상도가 약 2배가 되어 치수·범례 판독률이 올라갑니다.
 */

/** 렌더링 결과의 긴 변 상한(px) — 메모리·PNG 크기 보호 */
const MAX_RENDER_LONG_EDGE = 6_000;
/** 기본 렌더 배율 (72dpi 기준 3배 ≈ 216dpi) */
const DEFAULT_SCALE = 3;

export type PageTile = {
  /** 사람이 읽는 위치 라벨 (좌상/우상/좌하/우하) */
  label: string;
  /** PNG base64 */
  base64: string;
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
    const scale = Math.min(DEFAULT_SCALE, MAX_RENDER_LONG_EDGE / longEdge);

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
      ctx.drawImage(image, pos.x, pos.y, pos.w, pos.h, 0, 0, pos.w, pos.h);
      tiles.push({ label: pos.label, base64: canvas.toBuffer("image/png").toString("base64") });
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
