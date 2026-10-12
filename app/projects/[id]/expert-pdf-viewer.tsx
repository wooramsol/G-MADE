"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { ExpertMemo } from "@/lib/types";

/**
 * 전문가 분석 PDF 뷰어 — 브라우저에서 pdf.js로 페이지를 그리고, 그 위에 메모 영역 박스를 얹는다.
 * - 영역 표시 도구: 드래그로 네모를 그리면 onDraftComplete로 정규화 좌표(0~1)를 넘긴다.
 * - 선택 도구: 박스를 누르면 onSelectMemo.
 */

export type ViewerTool = "select" | "box";
export type Region = ExpertMemo["region"];

type DocSource = { directUrl: string | null; fallbackUrl: string };

/** 사파리 캔버스 한도(약 16.7M px) 아래로 */
const MAX_CANVAS_PIXELS = 16_000_000;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

async function openDocument(source: DocSource, onProgress: (ratio: number) => void): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfjs();
  const common = {
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    wasmUrl: "/pdfjs/wasm/",
  };
  const attempt = async (url: string) => {
    const task = pdfjs.getDocument({ url, ...common });
    task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      if (total > 0) onProgress(Math.min(1, loaded / total));
    };
    return task.promise;
  };
  if (source.directUrl) {
    try {
      return await attempt(source.directUrl);
    } catch (error) {
      console.warn("[expert-viewer] 직접 다운로드 실패, 서버 경유로 재시도", error);
    }
  }
  return attempt(source.fallbackUrl);
}

export function useExpertPdf(params: { projectId: string; reviewId: string | null; fileId: string | null; enabled: boolean }) {
  const { projectId, reviewId, fileId, enabled } = params;
  const [state, setState] = useState<{
    key: string | null;
    doc: PDFDocumentProxy | null;
    progress: number;
    error: string | null;
  }>({ key: null, doc: null, progress: 0, error: null });
  const key = reviewId && fileId ? `${reviewId}/${fileId}` : null;

  useEffect(() => {
    if (!enabled || !key || !reviewId || !fileId) return;
    if (state.key === key && (state.doc || state.error)) return;
    let cancelled = false;
    let opened: PDFDocumentProxy | null = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ key, doc: null, progress: 0, error: null });
    (async () => {
      try {
        const query = new URLSearchParams({ projectId, reviewId, fileId });
        const response = await fetch(`/api/expert-review/document?${query}`);
        const payload = (await response.json().catch(() => ({}))) as Partial<DocSource> & { error?: string };
        if (!response.ok || !payload.fallbackUrl) throw new Error(payload.error ?? "도서 파일 주소를 받지 못했습니다.");
        opened = await openDocument(
          { directUrl: payload.directUrl ?? null, fallbackUrl: payload.fallbackUrl },
          (ratio) => {
            if (!cancelled) setState((prev) => (prev.key === key ? { ...prev, progress: ratio } : prev));
          },
        );
        if (cancelled) {
          void opened.loadingTask.destroy();
          return;
        }
        setState({ key, doc: opened, progress: 1, error: null });
      } catch (error) {
        if (!cancelled) {
          setState({ key, doc: null, progress: 0, error: error instanceof Error ? error.message : "PDF를 열지 못했습니다." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // state는 의도적으로 제외 (같은 키 재요청 방지용으로만 읽음)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, projectId, reviewId, fileId]);

  const current = state.key === key ? state : { key, doc: null, progress: 0, error: null };
  return current;
}

export type ViewerBox = {
  id: string;
  region: Region;
  label: string;
  /** "mine" | "other" = 현재 버전 메모, "previous" = 이전 버전 참고 */
  kind: "current" | "previous";
  selected: boolean;
};

export default function ExpertPdfViewer({
  doc,
  page,
  zoom,
  tool,
  boxes,
  onSelectBox,
  onDraftComplete,
  draftRegion,
  draftPopover,
  onPageCount,
}: {
  doc: PDFDocumentProxy;
  page: number;
  /** 1 = 화면 폭 맞춤 */
  zoom: number;
  tool: ViewerTool;
  boxes: ViewerBox[];
  onSelectBox: (id: string) => void;
  onDraftComplete: (region: Region) => void;
  /** 저장 전 그려 둔 영역 (입력창이 붙음) */
  draftRegion: Region | null;
  draftPopover: ReactNode;
  onPageCount?: (count: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  useEffect(() => {
    onPageCount?.(doc.numPages);
  }, [doc, onPageCount]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setContainerWidth(element.clientWidth));
    observer.observe(element);
    setContainerWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (containerWidth <= 0) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    (async () => {
      setRendering(true);
      try {
        const pdfPage = await doc.getPage(Math.min(Math.max(1, page), doc.numPages));
        if (cancelled) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const fitScale = (containerWidth - 32) / base.width;
        const cssScale = Math.max(0.05, fitScale * zoom);
        const cssWidth = base.width * cssScale;
        const cssHeight = base.height * cssScale;
        const dpr = window.devicePixelRatio || 1;
        let pixelRatio = dpr;
        if (cssWidth * cssHeight * pixelRatio * pixelRatio > MAX_CANVAS_PIXELS) {
          pixelRatio = Math.sqrt(MAX_CANVAS_PIXELS / (cssWidth * cssHeight));
        }
        const viewport = pdfPage.getViewport({ scale: cssScale * pixelRatio });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const offscreen = document.createElement("canvas");
        offscreen.width = Math.floor(viewport.width);
        offscreen.height = Math.floor(viewport.height);
        const context = offscreen.getContext("2d");
        if (!context) return;
        task = pdfPage.render({ canvas: offscreen, canvasContext: context, viewport });
        await task.promise;
        if (cancelled) return;
        // 다 그린 뒤 한 번에 교체 — 확대·페이지 이동 중 빈 화면 깜빡임 방지
        canvas.width = offscreen.width;
        canvas.height = offscreen.height;
        canvas.getContext("2d")?.drawImage(offscreen, 0, 0);
        setSize({ width: cssWidth, height: cssHeight });
      } catch (error) {
        if (!cancelled && !(error instanceof Error && error.name === "RenderingCancelledException")) {
          console.warn("[expert-viewer] 렌더 실패", error);
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, zoom, containerWidth]);

  const toLocal = useCallback((event: ReactPointerEvent) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }, []);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (tool !== "box" || event.button !== 0) return;
    const point = toLocal(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ x0: point.x, y0: point.y, x1: point.x, y1: point.y });
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const point = toLocal(event);
    if (point) setDrag({ ...drag, x1: point.x, y1: point.y });
  };
  const onPointerUp = () => {
    if (!drag) return;
    const region = {
      x: Math.min(drag.x0, drag.x1),
      y: Math.min(drag.y0, drag.y1),
      width: Math.abs(drag.x1 - drag.x0),
      height: Math.abs(drag.y1 - drag.y0),
    };
    setDrag(null);
    if (region.width > 0.008 && region.height > 0.008) onDraftComplete(region);
  };

  const dragRegion = drag
    ? {
        x: Math.min(drag.x0, drag.x1),
        y: Math.min(drag.y0, drag.y1),
        width: Math.abs(drag.x1 - drag.x0),
        height: Math.abs(drag.y1 - drag.y0),
      }
    : null;
  const pct = (region: Region) => ({
    left: `${region.x * 100}%`,
    top: `${region.y * 100}%`,
    width: `${region.width * 100}%`,
    height: `${region.height * 100}%`,
  });

  return (
    <div className="relative max-h-[78vh] min-h-[560px] overflow-auto bg-[#eef1f5]" ref={containerRef}>
      <div className="flex min-w-full justify-center p-4" style={size ? { width: Math.max(containerWidth, size.width + 32) } : undefined}>
        <div
          className="relative bg-white shadow-sm"
          style={size ? { width: size.width, height: size.height } : { width: "100%", aspectRatio: "1.414 / 1" }}
        >
          <canvas className="block h-full w-full" ref={canvasRef} />
          <div
            className={`absolute inset-0 ${tool === "box" ? "cursor-crosshair" : ""}`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
            ref={overlayRef}
            style={{ touchAction: tool === "box" ? "none" : "auto" }}
          >
            {boxes.map((box) => (
              <button
                aria-label={`메모 ${box.label}`}
                className={`absolute rounded-[2px] border-2 transition ${
                  box.kind === "previous"
                    ? "border-dashed border-[#64748b] bg-[#64748b]/10"
                    : box.selected
                      ? "border-[#b45309] bg-[#f59e0b]/25 ring-2 ring-[#f59e0b]/50"
                      : "border-[#d97706] bg-[#f59e0b]/10 hover:bg-[#f59e0b]/20"
                } ${tool === "box" ? "pointer-events-none" : ""}`}
                key={box.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectBox(box.id);
                }}
                style={pct(box.region)}
                type="button"
              >
                <span
                  className={`absolute -left-[2px] -top-[22px] rounded-t-[3px] px-1.5 text-[11px] font-bold leading-5 text-white ${
                    box.kind === "previous" ? "bg-[#64748b]" : "bg-[#b45309]"
                  }`}
                >
                  {box.label}
                </span>
              </button>
            ))}
            {dragRegion ? (
              <div className="absolute border-2 border-[#b45309] bg-[#f59e0b]/15" style={pct(dragRegion)} />
            ) : null}
            {draftRegion ? (
              <>
                <div className="absolute border-2 border-dashed border-[#b45309] bg-[#f59e0b]/20" style={pct(draftRegion)} />
                <div
                  className="absolute z-10 w-[300px]"
                  style={{
                    left: `${Math.min(draftRegion.x * 100, 70)}%`,
                    top: `calc(${(draftRegion.y + draftRegion.height) * 100}% + 6px)`,
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  {draftPopover}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
      {rendering && !size ? (
        <p className="absolute inset-x-0 top-1/2 text-center text-xs text-[#64748b]">페이지를 그리는 중…</p>
      ) : null}
    </div>
  );
}

export function nextZoom(current: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((step) => step > current + 1e-6) ?? current;
  return [...ZOOM_STEPS].reverse().find((step) => step < current - 1e-6) ?? current;
}
