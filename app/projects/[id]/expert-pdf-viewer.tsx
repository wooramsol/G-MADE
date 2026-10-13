"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { ExpertMemo } from "@/lib/types";

/**
 * 전문가 분석 PDF 뷰어 — 브라우저에서 pdf.js로 페이지를 그리고, 그 위에 핀·메모(overlay)를 얹는다.
 * 핀 추가 모드에서 페이지 빈 곳을 누르면 onPageClick으로 정규화 좌표(0~1)를 넘긴다.
 */

export type Region = ExpertMemo["region"];

type DocSource = { directUrl: string | null; fallbackUrl: string };

/** 사파리 캔버스 한도(약 16.7M px) 아래로 */
const MAX_CANVAS_PIXELS = 12_000_000;
/** 렌더 캐시 총 픽셀 상한 (약 240MB 이하) */
const CACHE_PIXEL_BUDGET = 60_000_000;

type RenderedPage = { canvas: HTMLCanvasElement; cssWidth: number; cssHeight: number; pixels: number };
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

function ExpertPdfViewerImpl({
  doc,
  page,
  zoom,
  pinMode,
  onPageClick,
  overlay,
  onPageCount,
  prefetchPages = [],
}: {
  doc: PDFDocumentProxy;
  page: number;
  /** 1 = 화면 폭 맞춤 */
  zoom: number;
  /** 핀 추가 모드 — 페이지 빈 곳을 누르면 onPageClick */
  pinMode: boolean;
  onPageClick: (point: { x: number; y: number }) => void;
  /** 페이지 위에 얹을 핀·메모 (정규화 좌표 % 위치로 배치) */
  overlay: ReactNode;
  onPageCount?: (count: number) => void;
  /** 메모가 있는 페이지 — 한가할 때 미리 그려 즉시 표시 */
  prefetchPages?: number[];
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [rendering, setRendering] = useState(false);
  const prefetchRef = useRef<number[]>(prefetchPages);
  useEffect(() => {
    prefetchRef.current = prefetchPages;
  }, [prefetchPages]);

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

  // 렌더 결과 캐시 + 진행 중 렌더 공유 (페이지·배율별)
  // - 미리 그리던 페이지로 이동하면 처음부터 다시 그리지 않고 그 결과를 그대로 기다린다.
  // - 페이지를 옮겨도 미리 그리기는 취소하지 않는다 (예전엔 이동할 때마다 취소돼 클릭이 늦게 반영됨).
  const renderStoreRef = useRef<{
    doc: PDFDocumentProxy | null;
    entries: Map<string, RenderedPage>;
    inflight: Map<string, Promise<RenderedPage | null>>;
  }>({ doc: null, entries: new Map(), inflight: new Map() });
  const currentKeyRef = useRef<string>("");

  const getRendered = useCallback(
    (pageNumber: number): Promise<RenderedPage | null> => {
      const store = renderStoreRef.current;
      if (store.doc !== doc) {
        renderStoreRef.current = { doc, entries: new Map(), inflight: new Map() };
      }
      const { entries, inflight } = renderStoreRef.current;
      const key = `${pageNumber}|${zoom}|${containerWidth}`;
      const hit = entries.get(key);
      if (hit) {
        entries.delete(key);
        entries.set(key, hit); // LRU 갱신
        return Promise.resolve(hit);
      }
      const running = inflight.get(key);
      if (running) return running;

      const job = (async (): Promise<RenderedPage | null> => {
        const pdfPage = await doc.getPage(pageNumber);
        const base = pdfPage.getViewport({ scale: 1 });
        const cssScale = Math.max(0.05, ((containerWidth - 32) / base.width) * zoom);
        const cssWidth = base.width * cssScale;
        const cssHeight = base.height * cssScale;
        // 고해상도 화면도 2배까지만 — 그 이상은 체감 차이 없이 그리는 시간만 늘어남
        let pixelRatio = Math.min(2, window.devicePixelRatio || 1);
        if (cssWidth * cssHeight * pixelRatio * pixelRatio > MAX_CANVAS_PIXELS) {
          pixelRatio = Math.sqrt(MAX_CANVAS_PIXELS / (cssWidth * cssHeight));
        }
        const viewport = pdfPage.getViewport({ scale: cssScale * pixelRatio });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) return null;
        await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
        const entry: RenderedPage = { canvas, cssWidth, cssHeight, pixels: canvas.width * canvas.height };
        entries.set(key, entry);
        // 메모리 상한 — 오래된 것부터 버림 (지금 보고 있는 페이지는 유지)
        let total = 0;
        for (const value of entries.values()) total += value.pixels;
        for (const [oldKey, value] of entries) {
          if (total <= CACHE_PIXEL_BUDGET) break;
          if (oldKey === key || oldKey === currentKeyRef.current) continue;
          entries.delete(oldKey);
          total -= value.pixels;
          value.canvas.width = 0;
          value.canvas.height = 0;
        }
        return entry;
      })()
        .catch((error) => {
          console.warn("[expert-viewer] 렌더 실패", error);
          return null;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, job);
      return job;
    },
    [doc, zoom, containerWidth],
  );

  // 레이아웃 단계에서 실행 — 캐시된 페이지는 다음 화면 그리기 전에 바로 교체
  useLayoutEffect(() => {
    if (containerWidth <= 0) return;
    const current = Math.min(Math.max(1, page), doc.numPages);
    const key = `${current}|${zoom}|${containerWidth}`;
    currentKeyRef.current = key;

    const show = (entry: RenderedPage) => {
      const target = canvasRef.current;
      if (!target || currentKeyRef.current !== key) return;
      target.width = entry.canvas.width;
      target.height = entry.canvas.height;
      target.getContext("2d")?.drawImage(entry.canvas, 0, 0);
      setSize((prev) =>
        prev && prev.width === entry.cssWidth && prev.height === entry.cssHeight ? prev : { width: entry.cssWidth, height: entry.cssHeight },
      );
      setRendering(false);
    };

    const cached = renderStoreRef.current.doc === doc ? renderStoreRef.current.entries.get(key) : undefined;
    if (cached) {
      show(cached);
    } else {
      // 아직 안 그려진 페이지 — 이전 페이지를 남겨 두지 않고 즉시 비워서 "이동했음"을 바로 보여 줌
      const target = canvasRef.current;
      const context = target?.getContext("2d");
      if (target && context) {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, target.width, target.height);
      }
      setRendering(true);
      void getRendered(current).then((entry) => {
        if (entry) show(entry);
      });
    }
  }, [doc, page, zoom, containerWidth, getRendered]);

  // 미리 그리기 — 앞뒤 페이지와 메모가 있는 페이지를 한가할 때 차례로 (페이지 이동으로 취소되지 않음)
  const prefetchKey = prefetchPages.join(",");
  useEffect(() => {
    if (containerWidth <= 0) return;
    let stopped = false;
    const current = Math.min(Math.max(1, page), doc.numPages);
    const queue = [current + 1, current - 1, current + 2, ...prefetchRef.current]
      .filter((value, index, all) => value >= 1 && value <= doc.numPages && value !== current && all.indexOf(value) === index)
      .slice(0, 16);
    (async () => {
      for (const target of queue) {
        await new Promise<void>((resolve) => {
          const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
          if (idle) idle(() => resolve(), { timeout: 300 });
          else setTimeout(resolve, 30);
        });
        if (stopped) return;
        await getRendered(target);
      }
    })();
    return () => {
      // 다음 목록으로 넘어갈 뿐, 이미 시작한 렌더는 끝까지 그려 캐시에 남김
      stopped = true;
    };
  }, [doc, page, zoom, containerWidth, getRendered, prefetchKey]);

  const onOverlayMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    // 핀·메모 위를 누른 경우는 제외 (그쪽에서 처리)
    if (!pinMode || event.button !== 0 || event.target !== event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // 기본 동작(포커스 이동) 막기 — 새 입력칸에 바로 포커스가 가도록
    event.preventDefault();
    onPageClick({
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    });
  };

  return (
    <div className="relative max-h-[78vh] min-h-[560px] overflow-auto bg-[#eef1f5]" ref={containerRef}>
      <div className="flex min-w-full justify-center p-4 pb-40" style={size ? { width: Math.max(containerWidth, size.width + 32) } : undefined}>
        <div
          className="relative bg-white shadow-sm"
          style={size ? { width: size.width, height: size.height } : { width: "100%", aspectRatio: "1.414 / 1" }}
        >
          <canvas className="block h-full w-full select-none" ref={canvasRef} />
          <div
            className={`absolute inset-0 ${pinMode ? "cursor-crosshair" : ""}`}
            onMouseDown={onOverlayMouseDown}
          >
            {overlay}
          </div>
        </div>
      </div>
      {rendering ? (
        <p className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-[#15345b]/80 px-3 py-1 text-[11px] font-semibold text-white">
          페이지 불러오는 중…
        </p>
      ) : null}
    </div>
  );
}

export function nextZoom(current: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_STEPS.find((step) => step > current + 1e-6) ?? current;
  return [...ZOOM_STEPS].reverse().find((step) => step < current - 1e-6) ?? current;
}

/** 메모 입력 등 상위 상태 변화로 뷰어가 다시 그려지지 않도록 */
const ExpertPdfViewer = memo(ExpertPdfViewerImpl);
export default ExpertPdfViewer;
