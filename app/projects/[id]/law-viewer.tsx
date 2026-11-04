"use client";

import { useEffect, useMemo, useRef } from "react";
import { buildArticleJumpUrl } from "@/lib/reference-links";

export type StoredLaw = { title: string; article: string; summary: string; sourceUrl: string };
export type CitedLaw = { title: string; article?: string; sourceUrl?: string };

const squash = (text: string) => text.replace(/\s+/g, "");

/** 인용 표기에서 강조할 문구 — "[별표 3] 색채 심의기준 — 색채계획(기업 고유의…)" → "기업 고유의…" */
export function citedPhrase(article?: string): string {
  if (!article) return "";
  const detail = article.includes(" — ") ? article.split(" — ").slice(1).join(" — ") : article;
  const inner = detail.match(/[(（]([^)）]{4,})[)）]?/)?.[1];
  if (inner && !/^제\s*\d+/.test(detail)) return inner.trim();
  if (/^\s*(제\s*\d+|\[별표)/.test(detail)) return "";
  return detail.trim();
}

/** 저장된 조문 중 인용과 맞는 것 (별표가 여러 조각이면 문구가 들어 있는 조각) */
export function findCitedLaw(laws: StoredLaw[], cited: CitedLaw): StoredLaw | null {
  const sameTitle = laws.filter((law) => law.title === cited.title);
  if (sameTitle.length === 0) return null;
  const label = (cited.article ?? "").split(" — ")[0].trim();
  const phrase = squash(citedPhrase(cited.article));
  const labelMatches = label
    ? sameTitle.filter((law) => {
        const base = law.article.replace(/\s*\(\d+\/\d+\)$/, "");
        return label.startsWith(base) || base.startsWith(label);
      })
    : [];
  const pool = labelMatches.length > 0 ? labelMatches : sameTitle;
  if (phrase) {
    for (const length of [phrase.length, 20, 12, 8]) {
      const probe = phrase.slice(0, Math.min(length, phrase.length));
      if (probe.length < 4) break;
      const hit = pool.find((law) => squash(law.summary).includes(probe)) ?? sameTitle.find((law) => squash(law.summary).includes(probe));
      if (hit) return hit;
    }
  }
  return labelMatches[0] ?? (sameTitle.length === 1 ? sameTitle[0] : null);
}

/** 본문에서 강조 구간(원문 인덱스) 찾기 — 띄어쓰기 차이는 무시, 못 찾으면 점점 짧게 */
export function findHighlight(text: string, phrase: string): [number, number] | null {
  const target = squash(phrase);
  if (target.length < 2) return null;
  const map: number[] = [];
  let compact = "";
  for (let index = 0; index < text.length; index += 1) {
    if (/\s/.test(text[index])) continue;
    map.push(index);
    compact += text[index];
  }
  for (const length of [target.length, 24, 16, 10, 6]) {
    const probe = target.slice(0, Math.min(length, target.length));
    if (probe.length < 4 && probe.length !== target.length) break;
    const at = compact.indexOf(probe);
    if (at >= 0) {
      // 찾은 조각에서 원래 문구 길이만큼(또는 문장 끝까지) 넓힘
      const endCompact = Math.min(compact.length, at + Math.max(probe.length, Math.min(target.length, 80)));
      return [map[at], map[endCompact - 1] + 1];
    }
  }
  return null;
}

export function lawExternalUrl(cited: CitedLaw, phrase: string): string | undefined {
  const base = buildArticleJumpUrl(cited.sourceUrl, cited.article) ?? cited.sourceUrl;
  if (!base) return undefined;
  // 지원 브라우저(크롬·엣지·사파리)는 외부 페이지에서도 해당 문구로 이동·강조 (페이지 구조에 따라 안 될 수 있음)
  const fragment = phrase ? `#:~:text=${encodeURIComponent(phrase.slice(0, 40))}` : "";
  return `${base}${fragment}`;
}

export default function LawViewer({ cited, laws, onClose }: { cited: CitedLaw; laws: StoredLaw[]; onClose: () => void }) {
  const law = useMemo(() => findCitedLaw(laws, cited), [laws, cited]);
  const phrase = citedPhrase(cited.article);
  const range = useMemo(() => (law ? findHighlight(law.summary, phrase || cited.article || "") : null), [law, phrase, cited.article]);
  const markRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: "center" });
  }, [range]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const externalUrl = lawExternalUrl(cited, phrase);
  const text = law?.summary.replace(/^※[^—]*—[^.]*\.\s*/, "") ?? "";
  const shift = (law?.summary.length ?? 0) - text.length;
  const start = range ? range[0] - shift : -1;
  const end = range ? range[1] - shift : -1;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose} role="presentation">
      <div
        aria-label="인용 조문"
        aria-modal="true"
        className="flex max-h-[80vh] w-full max-w-[720px] flex-col rounded-lg bg-white shadow-xl"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#e2e8f0] px-5 py-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#64748b]">{cited.title}</p>
            <p className="mt-0.5 text-sm font-bold leading-5 text-[#15345b]">{law?.article ?? cited.article ?? ""}</p>
          </div>
          <button aria-label="닫기" className="shrink-0 rounded px-2 py-1 text-lg leading-none text-[#64748b] hover:bg-[#f1f5f9]" onClick={onClose} type="button">
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[13px] leading-6 text-[#172033] whitespace-pre-wrap">
          {law ? (
            start >= 0 && end > start ? (
              <>
                {text.slice(0, start)}
                <mark className="rounded-[2px] bg-[#fde68a] px-0.5 text-[#172033]" ref={markRef}>
                  {text.slice(start, end)}
                </mark>
                {text.slice(end)}
              </>
            ) : (
              text
            )
          ) : (
            <span className="text-[#64748b]">이 분석 결과에 저장된 조문 원문이 없습니다. 원문 열기로 국가법령정보센터에서 확인해 주세요.</span>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-[#e2e8f0] px-5 py-3">
          <p className="text-[11px] text-[#94a3b8]">
            {range ? "인용된 기준 문구를 노란색으로 표시했습니다." : phrase ? "본문에서 인용 문구를 정확히 찾지 못했습니다." : ""} 분석 당시 조회한 원문입니다.
          </p>
          {externalUrl ? (
            <a className="shrink-0 rounded-md border border-[#c9d6e6] px-3 py-1.5 text-xs font-bold text-[#2463b3] hover:bg-[#f3f7fc]" href={externalUrl} rel="noreferrer" target="_blank">
              국가법령정보센터 원문 열기 ↗
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
