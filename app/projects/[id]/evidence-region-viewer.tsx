"use client";

import { useEffect, useRef, useState } from "react";
import type { EvidenceRegion } from "@/lib/checklist-review/types";

export type EvidenceViewerTarget = {
  fileName: string;
  page: number;
  note: string;
  region?: EvidenceRegion;
  blobUrl: string;
};

function isImageFile(fileName: string): boolean {
  return /\.(png|jpe?g)$/i.test(fileName);
}

/**
 * 근거로 인용된 도면·이미지 페이지를 렌더링하고, AI가 지목한 위치에 마커를 표시하는 모달.
 * PDF는 pdf.js로 해당 페이지만 클라이언트에서 렌더링합니다.
 */
export default function EvidenceRegionViewer({
  target,
  onClose,
}: {
  target: EvidenceViewerTarget;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const image = isImageFile(target.fileName);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(image ? "ready" : "loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    if (image) return;

    let cancelled = false;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

        const doc = await pdfjs.getDocument({ url: target.blobUrl }).promise;
        const page = await doc.getPage(target.page);
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(3, Math.max(1, 1600 / baseViewport.width));
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("캔버스 컨텍스트를 생성하지 못했습니다.");

        await page.render({ canvas, canvasContext: context, viewport }).promise;
        if (cancelled) return;
        setStatus("ready");
      } catch (error) {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "페이지를 불러오지 못했습니다.");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [image, target.blobUrl, target.page]);

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#e2e8f0] px-5 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[#15345b]">
              「{target.fileName}」 p.{target.page}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-[#475569]">
              {target.note}
              {target.region ? (
                <span className="ml-1 text-[#94a3b8]">· 표시 위치는 AI 추정 근사치입니다</span>
              ) : (
                <span className="ml-1 text-[#94a3b8]">· 위치 좌표 없음 — 페이지 전체 참조</span>
              )}
            </p>
          </div>
          <button
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold text-[#475569] hover:bg-[#f1f5f9]"
            onClick={onClose}
            type="button"
          >
            닫기
          </button>
        </div>

        <div className="overflow-auto bg-[#f1f5f9] p-4">
          {status === "error" ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              도면을 불러오지 못했습니다: {errorMessage}
            </p>
          ) : (
            <div className="relative mx-auto w-fit">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={`${target.fileName} 근거 이미지`}
                  className="max-w-full rounded-lg bg-white shadow"
                  src={target.blobUrl}
                />
              ) : (
                <canvas className="max-w-full rounded-lg bg-white shadow" ref={canvasRef} />
              )}
              {status === "ready" && target.region ? (
                <div
                  className="pointer-events-none absolute rounded border-2 border-red-500 bg-red-500/10"
                  style={{
                    left: `${target.region.x * 100}%`,
                    top: `${target.region.y * 100}%`,
                    width: `${target.region.width * 100}%`,
                    height: `${target.region.height * 100}%`,
                  }}
                >
                  <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-red-500 px-1.5 py-0.5 text-[11px] font-bold text-white">
                    근거 위치
                  </span>
                </div>
              ) : null}
              {status === "loading" ? (
                <div className="flex h-48 w-72 items-center justify-center">
                  <p className="text-sm font-semibold text-[#64748b]">페이지 불러오는 중...</p>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
