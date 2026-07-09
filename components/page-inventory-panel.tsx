"use client";

import { useMemo, useState } from "react";
import type { FilePageInventory, PageContentKind } from "@/lib/ai/page-inventory";
import { Caption, MutedText, SubsectionTitle } from "@/components/typography";

type PageInventoryPanelProps = {
  inventory: FilePageInventory[];
  compact?: boolean;
  title?: string;
};

const KIND_STYLES: Record<PageContentKind, string> = {
  "목차": "bg-amber-50 text-amber-800 border-amber-200",
  "제목·구분": "bg-slate-100 text-slate-700 border-slate-200",
  "도면·본문": "bg-emerald-50 text-emerald-800 border-emerald-200",
  "텍스트": "bg-sky-50 text-sky-800 border-sky-200",
  "비어있음": "bg-red-50 text-red-700 border-red-200",
  "이미지·스캔": "bg-violet-50 text-violet-800 border-violet-200",
};

export default function PageInventoryPanel({
  inventory,
  compact = false,
  title = "문서 페이지 인식 결과",
}: PageInventoryPanelProps) {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => new Set(inventory.map((f) => f.fileName)));
  const [expandedPages, setExpandedPages] = useState<Set<string>>(() => new Set());

  const totals = useMemo(
    () => ({
      files: inventory.length,
      pages: inventory.reduce((sum, file) => sum + file.pages.length, 0),
    }),
    [inventory],
  );

  if (inventory.length === 0) {
    return null;
  }

  function toggleFile(fileName: string) {
    setExpandedFiles((current) => {
      const next = new Set(current);
      if (next.has(fileName)) next.delete(fileName);
      else next.add(fileName);
      return next;
    });
  }

  function togglePage(key: string) {
    setExpandedPages((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className={`rounded-2xl border border-[#d7dee8] bg-white ${compact ? "p-4" : "p-5 panel-shadow"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SubsectionTitle>{title}</SubsectionTitle>
          <MutedText className="mt-1">
            PDF를 페이지별로 읽었을 때 추출된 텍스트·도면·이미지 인식 결과입니다. AI 평가 전에 문서 이해가
            맞는지 확인하세요.
          </MutedText>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-[#eef4fb] px-3 py-1 text-xs font-bold text-[#2463b3]">
            파일 {totals.files}개
          </span>
          <span className="rounded-full bg-[#eef4fb] px-3 py-1 text-xs font-bold text-[#2463b3]">
            페이지 {totals.pages}쪽
          </span>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {inventory.map((file) => {
          const fileOpen = expandedFiles.has(file.fileName);
          return (
            <section className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc]" key={file.fileName}>
              <button
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                onClick={() => toggleFile(file.fileName)}
                type="button"
              >
                <div>
                  <p className="text-sm font-bold text-[#15345b]">{file.fileName}</p>
                  <Caption className="mt-0.5 text-[#64748b]">
                    {file.totalPages}쪽 · {file.fileType}
                    {file.hasVisionAssets ? " · 비전 분석 포함" : ""}
                  </Caption>
                </div>
                <span className="shrink-0 text-xs font-bold text-[#64748b]">{fileOpen ? "접기" : "펼치기"}</span>
              </button>

              {fileOpen ? (
                <div className="space-y-2 border-t border-[#e2e8f0] px-4 py-3">
                  {file.notes.length > 0 ? (
                    <ul className="space-y-1 rounded-lg bg-white px-3 py-2 text-xs leading-5 text-[#64748b]">
                      {file.notes.map((note) => (
                        <li key={note}>· {note}</li>
                      ))}
                    </ul>
                  ) : null}

                  {file.visionAssetLabels.length > 0 ? (
                    <p className="text-xs text-[#64748b]">
                      비전 자료: {file.visionAssetLabels.join(", ")}
                    </p>
                  ) : null}

                  <ol className="space-y-2">
                    {file.pages.map((page) => {
                      const pageKey = `${file.fileName}:${page.page}`;
                      const pageOpen = expandedPages.has(pageKey) || compact;
                      return (
                        <li className="rounded-lg border border-[#e2e8f0] bg-white" key={pageKey}>
                          <button
                            className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left"
                            onClick={() => togglePage(pageKey)}
                            type="button"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-bold text-[#15345b]">p.{page.page}</span>
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${KIND_STYLES[page.contentKind]}`}
                                >
                                  {page.contentKind}
                                </span>
                                {page.sectionLabel ? (
                                  <span className="rounded-full bg-[#eef4fb] px-2 py-0.5 text-[10px] font-bold text-[#2463b3]">
                                    {page.sectionLabel}
                                  </span>
                                ) : null}
                                <Caption className="text-[#94a3b8]">{page.charCount}자</Caption>
                              </div>
                              {!pageOpen && page.textPreview ? (
                                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#64748b]">
                                  {page.textPreview}
                                </p>
                              ) : null}
                            </div>
                            {!compact ? (
                              <span className="shrink-0 text-[10px] font-bold text-[#94a3b8]">
                                {pageOpen ? "▲" : "▼"}
                              </span>
                            ) : null}
                          </button>

                          {pageOpen ? (
                            <div className="border-t border-[#eef2f7] px-3 py-2.5">
                              {page.detectedElements.length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {page.detectedElements.map((element) => (
                                    <span
                                      className="rounded-md bg-[#f1f5f9] px-2 py-0.5 text-[10px] font-semibold text-[#475569]"
                                      key={`${pageKey}:${element}`}
                                    >
                                      {element}
                                    </span>
                                  ))}
                                </div>
                              ) : null}

                              {page.textPreview ? (
                                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#f8fafc] p-3 text-xs leading-5 text-[#334155]">
                                  {page.textPreview}
                                </pre>
                              ) : (
                                <p className="mt-2 text-xs italic text-[#94a3b8]">
                                  이 페이지에서 추출된 텍스트가 없습니다.
                                  {file.hasVisionAssets
                                    ? " 스캔·도면은 AI 비전 분석으로 확인합니다."
                                    : ""}
                                </p>
                              )}
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
