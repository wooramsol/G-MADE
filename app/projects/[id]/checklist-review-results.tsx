"use client";

import { useMemo, useState } from "react";
import { Caption, Eyebrow, MutedText, SubsectionTitle } from "@/components/typography";
import type {
  ChecklistFinding,
  ChecklistItem,
  ChecklistItemStatus,
  ChecklistReview,
} from "@/lib/checklist-review/types";
import { CHECKLIST_ITEM_STATUSES } from "@/lib/checklist-review/types";
import { formatUploadDateTime } from "@/lib/format-datetime";
import EvidenceRegionViewer, { type EvidenceViewerTarget } from "./evidence-region-viewer";
import { buildArticleDeepLink } from "@/lib/reference-links";

const STATUS_STYLES: Record<ChecklistItemStatus, { badge: string; dot: string }> = {
  충족: { badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  부분충족: { badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  미충족: { badge: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" },
  확인불가: { badge: "bg-slate-100 text-slate-600 border-slate-200", dot: "bg-slate-400" },
};

type StatusFilter = ChecklistItemStatus | "전체";

export default function ChecklistReviewResults({ review }: { review: ChecklistReview }) {
  const [filter, setFilter] = useState<StatusFilter>("전체");

  /** 근거 fileName → 열람 가능한 blobUrl (PDF·이미지만) */
  const blobUrlByFileName = useMemo(() => {
    const map = new Map<string, string>();
    for (const file of review.files) {
      if (file.blobUrl && /\.(pdf|png|jpe?g)$/i.test(file.originalName)) {
        map.set(file.originalName, file.blobUrl);
      }
    }
    return map;
  }, [review.files]);

  const findingsByItemId = useMemo(() => {
    const map = new Map<string, ChecklistFinding>();
    for (const finding of review.findings) map.set(finding.itemId, finding);
    return map;
  }, [review.findings]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, ChecklistItem[]>();
    for (const item of review.items) {
      const finding = findingsByItemId.get(item.id);
      if (filter !== "전체" && finding?.status !== filter) continue;
      const key = item.category?.trim() || "일반";
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [review.items, findingsByItemId, filter]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SubsectionTitle>체크리스트 검토 결과</SubsectionTitle>
          <Caption className="mt-1 text-[#64748b]">
            {formatUploadDateTime(review.reviewedAt)} · 항목 {review.items.length}개 ·{" "}
            {review.itemSource === "vision" ? "스캔 문서(비전 추출)" : "텍스트 추출"} · {review.model}
          </Caption>
        </div>
        {review.checklistPages.length > 0 ? (
          <Caption className="text-[#64748b]">
            체크리스트 페이지:{" "}
            {review.checklistPages
              .map((page) => `「${page.fileName}」 p.${page.page}`)
              .join(", ")}
          </Caption>
        ) : null}
      </div>

      {review.summary ? (
        <p className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4 text-sm font-semibold leading-6 text-[#172033]">
          {review.summary}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <FilterChip
          active={filter === "전체"}
          label={`전체 ${review.items.length}`}
          onClick={() => setFilter("전체")}
        />
        {CHECKLIST_ITEM_STATUSES.map((status) => (
          <FilterChip
            active={filter === status}
            key={status}
            label={`${status} ${review.counts[status] ?? 0}`}
            onClick={() => setFilter(status)}
            tone={status}
          />
        ))}
      </div>

      <div className="space-y-6">
        {groupedItems.map(([category, items]) => (
          <div key={category}>
            <Eyebrow>{category}</Eyebrow>
            <ul className="mt-2 space-y-3">
              {items.map((item) => (
                <FindingCard
                  blobUrlByFileName={blobUrlByFileName}
                  finding={findingsByItemId.get(item.id)}
                  item={item}
                  key={item.id}
                />
              ))}
            </ul>
          </div>
        ))}
        {groupedItems.length === 0 ? (
          <MutedText>해당 상태의 항목이 없습니다.</MutedText>
        ) : null}
      </div>

      {review.warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-bold text-amber-800">검토 참고</p>
          <ul className="mt-1 space-y-1 text-xs text-amber-800">
            {review.warnings.map((warning) => (
              <li key={warning}>· {warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {review.referenceLaws.length > 0 ? (
        <details className="rounded-xl border border-[#d7dee8] bg-white p-4">
          <summary className="cursor-pointer text-sm font-bold text-[#15345b]">
            검토에 참조한 법령·지침 {review.referenceLaws.length}건 (국가법령정보센터)
          </summary>
          <ul className="mt-3 space-y-2 text-sm">
            {review.referenceLaws.map((law) => (
              <li key={`${law.title}-${law.article}`}>
                <a
                  className="font-semibold text-[#2463b3] hover:underline"
                  href={buildArticleDeepLink(law.title, law.article) ?? law.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  {law.title} {law.article}
                </a>
                <span className="ml-2 text-[#64748b]">{law.summary.slice(0, 80)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
  tone,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  tone?: ChecklistItemStatus;
}) {
  return (
    <button
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${
        active
          ? "border-[#2463b3] bg-[#2463b3] text-white"
          : "border-[#d7dee8] bg-white text-[#475569] hover:bg-[#f8fafc]"
      }`}
      onClick={onClick}
      type="button"
    >
      {tone ? <span className={`h-2 w-2 rounded-full ${STATUS_STYLES[tone].dot}`} /> : null}
      {label}
    </button>
  );
}

function FindingCard({
  item,
  finding,
  blobUrlByFileName,
}: {
  item: ChecklistItem;
  finding?: ChecklistFinding;
  blobUrlByFileName: Map<string, string>;
}) {
  const status = finding?.status ?? "확인불가";
  const style = STATUS_STYLES[status];
  const [viewerTarget, setViewerTarget] = useState<EvidenceViewerTarget | null>(null);

  return (
    <li className="rounded-xl border border-[#d7dee8] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm font-bold leading-6 text-[#172033]">{item.text}</p>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${style.badge}`}>
          {status}
        </span>
      </div>

      {finding?.rationale ? (
        <p className="mt-2 text-sm leading-6 text-[#475569]">{finding.rationale}</p>
      ) : null}

      {finding && finding.evidence.length > 0 ? (
        <div className="mt-3 space-y-1">
          {finding.evidence.map((evidence, index) => {
            const blobUrl = blobUrlByFileName.get(evidence.fileName);
            const showViewer = Boolean(blobUrl && evidence.region);
            return (
              <p className="text-xs leading-5 text-[#64748b]" key={`${evidence.fileName}-${evidence.page}-${index}`}>
                <span className="font-bold text-[#15345b]">
                  「{evidence.fileName}」 p.{evidence.page}
                </span>{" "}
                — {evidence.note}
                {showViewer ? (
                  <button
                    className="ml-2 inline-flex items-center rounded-full bg-[#eef4fb] px-2 py-0.5 text-[11px] font-bold text-[#2463b3] hover:bg-[#dcebfb]"
                    onClick={() =>
                      setViewerTarget({
                        fileName: evidence.fileName,
                        page: evidence.page,
                        note: evidence.note,
                        region: evidence.region,
                        blobUrl: blobUrl as string,
                      })
                    }
                    type="button"
                  >
                    도면에서 위치 보기
                  </button>
                ) : null}
              </p>
            );
          })}
        </div>
      ) : null}

      {viewerTarget ? <EvidenceRegionViewer onClose={() => setViewerTarget(null)} target={viewerTarget} /> : null}

      {finding?.spatialNote ? (
        <p className="mt-2 rounded-lg bg-[#f0f7ff] px-3 py-2 text-xs leading-5 text-[#1d4f8c]">
          공간정보: {finding.spatialNote}
        </p>
      ) : null}

      {finding && finding.lawRefs.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {finding.lawRefs.map((law) =>
            law.sourceUrl ? (
              <a
                className="rounded-full bg-[#eef4fb] px-2.5 py-1 text-[11px] font-bold text-[#2463b3] hover:underline"
                href={buildArticleDeepLink(law.title, law.article) ?? law.sourceUrl}
                key={`${law.title}-${law.article ?? ""}`}
                rel="noreferrer"
                target="_blank"
              >
                {law.title}
                {law.article ? ` ${law.article}` : ""}
              </a>
            ) : (
              <span
                className="rounded-full bg-[#eef4fb] px-2.5 py-1 text-[11px] font-bold text-[#2463b3]"
                key={`${law.title}-${law.article ?? ""}`}
              >
                {law.title}
                {law.article ? ` ${law.article}` : ""}
              </span>
            ),
          )}
        </div>
      ) : null}

      {finding?.recommendation ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-800">
          보완 방향: {finding.recommendation}
        </p>
      ) : null}
    </li>
  );
}
