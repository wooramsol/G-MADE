"use client";

import { useState } from "react";
import ExpertPageNavigator from "./expert-page-navigator";
import ExpertPdfViewer, { useExpertPdf } from "./expert-pdf-viewer";

/** 사전검토 — 접수 도서를 그대로 열람 (표시·의견 없이 보기만) */
export default function ScreeningViewer({ projectId, fileId }: { projectId: string; fileId: string }) {
  const pdf = useExpertPdf({ projectId, reviewId: null, fileId, enabled: true });
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const goTo = (next: number) => setPage(Math.max(1, Math.min(pageCount || next, next)));
  const empty = new Map<number, number>();

  return (
    <div className="grid gap-4 xl:grid-cols-[136px_1fr]">
      <div className="relative hidden min-h-0 flex-col rounded-md border border-[#d7dee8] bg-white xl:flex">
        <p className="border-b border-[#e2e8f0] px-3 py-2.5 text-xs font-bold text-[#15345b]">
          페이지 <span className="font-medium text-[#94a3b8]">{pageCount || ""}</span>
        </p>
        {pdf.doc ? <ExpertPageNavigator changedPages={new Set()} counts={empty} doc={pdf.doc} onSelect={goTo} page={page} /> : null}
      </div>
      <div className="min-w-0 rounded-md border border-[#d7dee8] bg-white">
        <div className="flex items-center gap-1 border-b border-[#e2e8f0] px-3 py-2 text-xs text-[#475569]">
          <button className="h-8 w-8 rounded-[4px] hover:bg-[#f1f5f9] disabled:opacity-30" disabled={page <= 1} onClick={() => goTo(page - 1)} type="button">
            ◀
          </button>
          <span className="min-w-[60px] text-center font-semibold">
            {page} / {pageCount || "—"}
          </span>
          <button className="h-8 w-8 rounded-[4px] hover:bg-[#f1f5f9] disabled:opacity-30" disabled={pageCount > 0 && page >= pageCount} onClick={() => goTo(page + 1)} type="button">
            ▶
          </button>
          <span className="ml-auto text-[#94a3b8]">도서 열람 (사전검토)</span>
        </div>
        {pdf.error ? (
          <p className="p-10 text-center text-sm text-[#b91c1c]">도서를 열지 못했습니다. {pdf.error}</p>
        ) : !pdf.doc ? (
          <p className="p-10 text-center text-sm text-[#475569]">도서를 불러오는 중… {pdf.progress > 0 ? `${Math.round(pdf.progress * 100)}%` : ""}</p>
        ) : (
          <ExpertPdfViewer doc={pdf.doc} onPageClick={() => undefined} onPageCount={setPageCount} overlay={null} page={page} pinMode={false} zoom={1} />
        )}
      </div>
    </div>
  );
}
