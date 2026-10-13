"use client";

import { memo, useEffect, useRef } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

/**
 * 페이지 네비게이터 — 모든 페이지를 작은 썸네일로 세로 나열하고 메모 개수를 표시.
 * 썸네일은 화면에 보이는 것만, 한 번에 하나씩 작게 그린다 (본 화면 그리기를 방해하지 않도록).
 */

const THUMB_WIDTH = 104;

type Job = () => Promise<void>;
const queue: Job[] = [];
let running = false;
async function pump() {
  if (running) return;
  running = true;
  while (queue.length > 0) {
    const job = queue.shift();
    if (job) await job().catch(() => undefined);
  }
  running = false;
}

function Thumb({
  doc,
  pageNumber,
  active,
  count,
  changed,
  onSelect,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  active: boolean;
  count: number;
  changed: boolean;
  onSelect: (page: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const holderRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    let done = false;
    let queued = false;
    const draw: Job = async () => {
      if (done) return;
      const page = await doc.getPage(pageNumber);
      const base = page.getViewport({ scale: 1 });
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale: (THUMB_WIDTH / base.width) * ratio });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.height = `${(viewport.height / ratio).toFixed(1)}px`;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) return;
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      done = true;
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !queued && !done) {
          queued = true;
          queue.push(draw);
          void pump();
        }
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(holder);
    return () => {
      done = true;
      observer.disconnect();
    };
  }, [doc, pageNumber]);

  return (
    <button
      className={`group relative block w-full rounded-[4px] border-2 p-1 text-left ${
        active ? "border-[#b45309] bg-[#fff8ed]" : "border-transparent hover:border-[#cbd5e1]"
      }`}
      data-page={pageNumber}
      onMouseDown={(event) => {
        if (event.button === 0) onSelect(pageNumber);
      }}
      ref={holderRef}
      type="button"
    >
      <canvas className="block w-full bg-white shadow-sm" ref={canvasRef} style={{ height: 74 }} />
      <span className="mt-1 flex items-center justify-between text-[11px] leading-4">
        <span className={`font-semibold ${active ? "text-[#b45309]" : "text-[#64748b]"}`}>
          {pageNumber}
          {changed ? <span className="ml-1 text-[10px] text-[#92400e]">변경</span> : null}
        </span>
        {count > 0 ? (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#b45309] px-1 text-[10px] font-bold text-white">
            {count}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function ExpertPageNavigatorImpl({
  doc,
  page,
  counts,
  changedPages,
  onSelect,
}: {
  doc: PDFDocumentProxy;
  page: number;
  /** 페이지 → 메모 개수 */
  counts: Map<number, number>;
  changedPages: Set<number>;
  onSelect: (page: number) => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);

  // 현재 페이지 썸네일이 목록 안에 보이도록 (목록 상자만 스크롤 — 화면 전체는 움직이지 않음)
  useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>(`[data-page="${page}"]`);
    if (!list || !item) return;
    // 화면 좌표로 비교 — 이미 보이면 그대로 두고, 가려져 있을 때만 목록 안에서 조금 스크롤
    const listRect = list.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    if (itemRect.top < listRect.top) list.scrollTop += itemRect.top - listRect.top - 8;
    else if (itemRect.bottom > listRect.bottom) list.scrollTop += itemRect.bottom - listRect.bottom + 8;
  }, [page]);

  const pages = Array.from({ length: doc.numPages }, (_, index) => index + 1);
  return (
    <div className="relative max-h-[calc(78vh+49px)] space-y-1.5 overflow-y-auto p-2" ref={listRef}>
      {pages.map((pageNumber) => (
        <Thumb
          active={pageNumber === page}
          changed={changedPages.has(pageNumber)}
          count={counts.get(pageNumber) ?? 0}
          doc={doc}
          key={pageNumber}
          onSelect={onSelect}
          pageNumber={pageNumber}
        />
      ))}
    </div>
  );
}

const ExpertPageNavigator = memo(ExpertPageNavigatorImpl);
export default ExpertPageNavigator;
