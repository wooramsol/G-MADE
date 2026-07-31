"use client";

import { useCallback, useMemo, useState } from "react";
import { Caption, Eyebrow, MutedText, SubsectionTitle } from "@/components/typography";
import type {
  ChecklistFinding,
  ChecklistItem,
  ChecklistItemStatus,
  ChecklistReview,
} from "@/lib/checklist-review/types";
import { CHECKLIST_ITEM_STATUSES } from "@/lib/checklist-review/types";
import { formatUploadDateTime } from "@/lib/format-datetime";
import { buildArticleJumpUrl } from "@/lib/reference-links";

const STATUS_STYLES: Record<ChecklistItemStatus, { badge: string; dot: string; card: string }> = {
  충족: {
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
    card: "border-emerald-200 bg-emerald-50/50",
  },
  부분충족: {
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
    card: "border-amber-200 bg-amber-50/50",
  },
  미충족: {
    badge: "bg-red-50 text-red-700 border-red-200",
    dot: "bg-red-500",
    card: "border-red-200 bg-red-50/50",
  },
  확인불가: {
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
    card: "border-slate-200 bg-slate-50/60",
  },
};

type StatusFilter = ChecklistItemStatus | "전체";

/**
 * 총평을 읽기 쉬운 문단으로 나눕니다.
 * 줄바꿈 우선 분리 후, 220자를 넘는 문단은 문장 단위로 묶어 재분할합니다
 * (배치 요약을 한 줄로 이어붙인 기존 검토 데이터 대응).
 */
function splitSummaryParagraphs(summary: string): string[] {
  const blocks = summary
    .split(/\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  const paragraphs: string[] = [];
  for (const block of blocks) {
    if (block.length <= 220) {
      paragraphs.push(block);
      continue;
    }

    const sentences = block.split(/(?<=[.!?])\s+/).filter(Boolean);
    let current = "";
    for (const sentence of sentences) {
      if (current && current.length + sentence.length > 180) {
        paragraphs.push(current.trim());
        current = sentence;
      } else {
        current = current ? `${current} ${sentence}` : sentence;
      }
    }
    if (current.trim()) paragraphs.push(current.trim());
  }

  return paragraphs;
}

export default function ChecklistReviewResults({
  review,
  projectId,
}: {
  review: ChecklistReview;
  projectId: string;
}) {
  const [filter, setFilter] = useState<StatusFilter>("전체");

  // 항목별 공무원 코멘트 — 낙관적 로컬 상태 (저장 성공 시 갱신, 검토 전환 시 리셋)
  const [comments, setComments] = useState<Record<string, string>>(review.comments ?? {});
  const [commentsReviewId, setCommentsReviewId] = useState(review.id);
  if (commentsReviewId !== review.id) {
    // 다른 검토로 전환됨 — 렌더 중 상태 보정 패턴 (https://react.dev/learn/you-might-not-need-an-effect)
    setCommentsReviewId(review.id);
    setComments(review.comments ?? {});
  }

  const saveComment = useCallback(
    async (itemId: string, text: string) => {
      const response = await fetch("/api/checklist-reviews", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, reviewId: review.id, itemId, comment: text }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "코멘트를 저장하지 못했습니다.");
      }
      setComments((prev) => {
        const next = { ...prev };
        if (text.trim()) {
          next[itemId] = text.trim();
        } else {
          delete next[itemId];
        }
        return next;
      });
    },
    [projectId, review.id],
  );

  /** 근거 fileName·page → 원본 PDF 해당 페이지를 여는 링크 (NFC 정규화 + 단일 PDF 폴백) */
  const pageHref = useMemo(() => {
    const normalize = (name: string) => name.normalize("NFC");
    const idByName = new Map<string, string>();
    const pdfFiles = review.files.filter((file) => /\.pdf$/i.test(file.originalName));
    for (const file of pdfFiles) idByName.set(normalize(file.originalName), file.id);

    return (fileName: string, page: number): string | undefined => {
      // 저장·역직렬화 과정에서 페이지가 문자열로 들어오는 경우가 있어 숫자로 강제 변환
      const pageNumber = Number(page);
      const fileId = idByName.get(normalize(fileName)) ?? (pdfFiles.length === 1 ? pdfFiles[0].id : undefined);
      if (!fileId || !Number.isFinite(pageNumber) || pageNumber < 1) return undefined;
      return `/api/checklist-reviews/original-file?projectId=${encodeURIComponent(projectId)}&reviewId=${encodeURIComponent(review.id)}&fileId=${encodeURIComponent(fileId)}#page=${pageNumber}`;
    };
  }, [review.files, review.id, projectId]);

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
            {review.itemSource === "vision" ? "스캔 문서(비전 추출)" : "텍스트 추출"} · G-Made Hive AI
          </Caption>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {review.checklistPages.length > 0 ? (
            <Caption className="text-[#64748b]">
              체크리스트 페이지:{" "}
              {review.checklistPages.map((page) => `p.${page.page}`).join(", ")}
            </Caption>
          ) : null}
          <a
            className="primary-action-blue inline-flex items-center rounded-lg px-3.5 py-2 text-xs font-bold hover:opacity-90"
            href={`/api/checklist-reviews/supplement-doc?projectId=${encodeURIComponent(projectId)}&reviewId=${encodeURIComponent(review.id)}`}
          >
            보완요구서 초안 다운로드 (.docx)
          </a>
        </div>
      </div>

      {review.summary ? (
        <div className="space-y-2.5 rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4">
          {splitSummaryParagraphs(review.summary).map((paragraph, index) => (
            <p className="text-sm font-semibold leading-6 text-[#172033]" key={index}>
              {paragraph}
            </p>
          ))}
        </div>
      ) : null}

      {review.metrics && review.metrics.length > 0 ? (
        <div className="rounded-xl border border-[#d7dee8] bg-white p-4">
          <p className="text-sm font-bold text-[#15345b]">사업 규모 (문서에서 자동 인식)</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {review.metrics.map((metric) => (
              <div className="rounded-lg bg-[#f8fafc] px-3 py-2 text-xs" key={metric.label}>
                <p className="font-bold text-[#475569]">{metric.label}</p>
                <p className="mt-0.5 font-semibold leading-5 text-[#172033]">{metric.value}</p>
                {metric.source ? (
                  <p className="mt-0.5 text-[10px] text-[#94a3b8]">
                    p.{metric.source.page}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-4 text-[#94a3b8]">
            제출 문서에 명시된 값을 원문 그대로 추출한 결과입니다. 최종 수치는 도서 원본으로 확인해 주세요.
          </p>
        </div>
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
                  comment={comments[item.id]}
                  finding={findingsByItemId.get(item.id)}
                  item={item}
                  key={item.id}
                  onSaveComment={saveComment}
                  pageHref={pageHref}
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
                  href={buildArticleJumpUrl(law.sourceUrl, law.article) ?? law.sourceUrl}
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
  pageHref,
  comment,
  onSaveComment,
}: {
  item: ChecklistItem;
  finding?: ChecklistFinding;
  pageHref: (fileName: string, page: number) => string | undefined;
  comment?: string;
  onSaveComment: (itemId: string, text: string) => Promise<void>;
}) {
  const status = finding?.status ?? "확인불가";
  const style = STATUS_STYLES[status];

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [commentError, setCommentError] = useState("");

  const startEditing = () => {
    setDraft(comment ?? "");
    setCommentError("");
    setEditing(true);
  };

  const submitComment = async (text: string) => {
    setSaving(true);
    setCommentError("");
    try {
      await onSaveComment(item.id, text);
      setEditing(false);
    } catch (error) {
      setCommentError(error instanceof Error ? error.message : "코멘트를 저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className={`rounded-xl border p-4 ${style.card}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm font-bold leading-6 text-[#172033]">{item.text}</p>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${style.badge}`}>
          {status}
        </span>
      </div>

      {finding?.rationale || finding?.recommendation ? (
        <p className="mt-2 text-sm leading-6 text-[#475569]">
          {[finding?.rationale, finding?.recommendation].filter(Boolean).join(" ")}
        </p>
      ) : null}

      {finding && finding.evidence.length > 0 ? (
        <div className="mt-3 space-y-1">
          {finding.evidence.map((evidence, index) => {
            const href = pageHref(evidence.fileName, evidence.page);
            return (
              <p className="text-xs leading-5 text-[#64748b]" key={`${evidence.fileName}-${evidence.page}-${index}`}>
                {href ? (
                  <a
                    href={href}
                    rel="noreferrer"
                    style={{
                      color: "#2563eb",
                      fontWeight: 700,
                      textDecoration: "underline",
                      textUnderlineOffset: "2px",
                    }}
                    target="_blank"
                    title="원본 PDF의 해당 페이지 열기"
                  >
                    p.{evidence.page}
                  </a>
                ) : (
                  <span className="font-bold text-[#15345b]">p.{evidence.page}</span>
                )}{" "}
                — {evidence.note}
              </p>
            );
          })}
        </div>
      ) : null}


      {(finding && finding.lawRefs.length > 0) || (!editing && !comment) ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {(finding?.lawRefs ?? []).map((law) =>
            law.sourceUrl ? (
              <a
                className="rounded-full bg-[#eef4fb] px-2.5 py-1 text-[11px] font-bold text-[#2463b3] hover:underline"
                href={buildArticleJumpUrl(law.sourceUrl, law.article) ?? law.sourceUrl}
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
          {!editing && !comment ? (
            <button
              className="ml-auto rounded-full border border-[#c9d6e6] bg-white px-2.5 py-1 text-[11px] font-bold text-[#2463b3] hover:bg-[#eef4fb]"
              onClick={startEditing}
              type="button"
            >
              + 추가의견
            </button>
          ) : null}
        </div>
      ) : null}

      {editing ? (
        <div className="mt-3 rounded-lg border border-[#c9d6e6] bg-white p-2.5">
          <textarea
            autoFocus
            className="w-full resize-y rounded-md border border-[#d7dee8] px-2.5 py-1.5 text-xs leading-5 text-[#172033] focus:border-[#2463b3] focus:outline-none"
            disabled={saving}
            maxLength={2000}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="이 항목에 대한 추가의견을 입력하세요"
            rows={2}
            value={draft}
          />
          {commentError ? <p className="mt-1 text-[11px] font-semibold text-red-600">{commentError}</p> : null}
          <div className="mt-1.5 flex items-center justify-end gap-1.5">
            {comment ? (
              <button
                className="rounded-md px-2 py-1 text-[11px] font-bold text-red-500 hover:bg-red-50 disabled:opacity-50"
                disabled={saving}
                onClick={() => void submitComment("")}
                type="button"
              >
                삭제
              </button>
            ) : null}
            <button
              className="rounded-md px-2 py-1 text-[11px] font-bold text-[#64748b] hover:bg-[#f1f5f9] disabled:opacity-50"
              disabled={saving}
              onClick={() => setEditing(false)}
              type="button"
            >
              취소
            </button>
            <button
              className="primary-action-blue rounded-md px-2.5 py-1 text-[11px] font-bold disabled:opacity-50"
              disabled={saving || !draft.trim()}
              onClick={() => void submitComment(draft)}
              type="button"
            >
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      ) : comment ? (
        <div className="mt-3 rounded-lg border border-[#c9d6e6] bg-white/80 px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1 whitespace-pre-wrap text-xs leading-5 text-[#334155]">
              <span className="mr-1.5 font-bold text-[#15345b]">추가의견</span>
              {comment}
            </p>
            <button
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold text-[#2463b3] hover:bg-[#eef4fb]"
              onClick={startEditing}
              type="button"
            >
              수정
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
