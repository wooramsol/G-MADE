"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

// 행정문서 톤 — 카드는 흰 바탕 + 좌측 상태색 실선, 뱃지는 각진 외곽선 태그
const STATUS_STYLES: Record<ChecklistItemStatus, { badge: string; dot: string; card: string }> = {
  충족: {
    badge: "bg-white text-emerald-700 border-emerald-400",
    dot: "bg-emerald-600",
    card: "border-[#d0d5dd] border-l-[3px] border-l-emerald-600 bg-white",
  },
  부분충족: {
    badge: "bg-white text-amber-700 border-amber-400",
    dot: "bg-amber-500",
    card: "border-[#d0d5dd] border-l-[3px] border-l-amber-500 bg-white",
  },
  미충족: {
    badge: "bg-white text-red-700 border-red-400",
    dot: "bg-red-600",
    card: "border-[#d0d5dd] border-l-[3px] border-l-red-600 bg-white",
  },
  확인불가: {
    badge: "bg-white text-slate-600 border-slate-300",
    dot: "bg-slate-400",
    card: "border-[#d0d5dd] border-l-[3px] border-l-slate-400 bg-white",
  },
};

type StatusFilter = ChecklistItemStatus | "전체";


/** 판정 순위 — 회차 간 개선/하락 판별용 (높을수록 좋음) */
const STATUS_RANK: Record<ChecklistItemStatus, number> = { 충족: 3, 부분충족: 2, 미충족: 1, 확인불가: 0 };

function normalizeItemTextForCompare(text: string): string {
  return text.replace(/\s+/g, "");
}

type ItemChange = { kind: "개선" | "하락"; from: ChecklistItemStatus } | { kind: "신규" };

export default function ChecklistReviewResults({
  review,
  previousReview,
  projectId,
}: {
  review: ChecklistReview;
  /** 직전 회차 검토 — 회차 간 변화(개선/하락/신규) 비교용. 첫 회차면 undefined. */
  previousReview?: ChecklistReview;
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

    return (
      fileName: string,
      page: number,
      region?: { x: number; y: number; width: number; height: number },
    ): { thumbSrc: string; fullSrc: string } | undefined => {
      // 저장·역직렬화 과정에서 페이지가 문자열로 들어오는 경우가 있어 숫자로 강제 변환
      const pageNumber = Number(page);
      const fileId = idByName.get(normalize(fileName)) ?? (pdfFiles.length === 1 ? pdfFiles[0].id : undefined);
      if (!fileId || !Number.isFinite(pageNumber) || pageNumber < 1) return undefined;
      const base = `projectId=${encodeURIComponent(projectId)}&reviewId=${encodeURIComponent(review.id)}&fileId=${encodeURIComponent(fileId)}`;
      // 근거는 전부 캡처 썸네일로 표시: region이 있으면 부위 크롭(빨간 박스), 없으면 페이지 전체.
      // 클릭 시 PDF로 이동하는 대신 큰 캡처 이미지를 엽니다 (워크플로우 단순화).
      const coords = region
        ? `&page=${pageNumber}&x=${region.x}&y=${region.y}&w=${region.width}&h=${region.height}`
        : `&page=${pageNumber}`;
      return {
        thumbSrc: `/api/checklist-reviews/evidence-snippet?${base}${coords}&size=thumb`,
        fullSrc: `/api/checklist-reviews/evidence-snippet?${base}${coords}&size=full`,
      };
    };
  }, [review.files, review.id, projectId]);

  const findingsByItemId = useMemo(() => {
    const map = new Map<string, ChecklistFinding>();
    for (const finding of review.findings) map.set(finding.itemId, finding);
    return map;
  }, [review.findings]);

  // 회차 비교 — 직전 회차와 항목 원문(공백 무시) 기준으로 매칭해 상태 변화를 계산
  const reviewFlagCount = useMemo(
    () => review.findings.filter((finding) => finding.reviewFlag).length,
    [review.findings],
  );

  const changesByItemId = useMemo(() => {
    const map = new Map<string, ItemChange>();
    if (!previousReview) return map;

    const prevStatusByText = new Map<string, ChecklistItemStatus>();
    const prevFindings = new Map(previousReview.findings.map((finding) => [finding.itemId, finding]));
    for (const item of previousReview.items) {
      const status = prevFindings.get(item.id)?.status;
      if (status) prevStatusByText.set(normalizeItemTextForCompare(item.text), status);
    }

    for (const item of review.items) {
      const current = findingsByItemId.get(item.id)?.status;
      if (!current) continue;
      const previous = prevStatusByText.get(normalizeItemTextForCompare(item.text));
      if (previous === undefined) {
        map.set(item.id, { kind: "신규" });
        continue;
      }
      if (STATUS_RANK[current] > STATUS_RANK[previous]) map.set(item.id, { kind: "개선", from: previous });
      else if (STATUS_RANK[current] < STATUS_RANK[previous]) map.set(item.id, { kind: "하락", from: previous });
    }
    return map;
  }, [previousReview, review.items, findingsByItemId]);

  const changeSummary = useMemo(() => {
    let improved = 0;
    let regressed = 0;
    let added = 0;
    for (const change of changesByItemId.values()) {
      if (change.kind === "개선") improved += 1;
      else if (change.kind === "하락") regressed += 1;
      else added += 1;
    }
    return { improved, regressed, added };
  }, [changesByItemId]);

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

      {previousReview && (changeSummary.improved > 0 || changeSummary.regressed > 0 || changeSummary.added > 0) ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-[#d7dee8] bg-white px-4 py-2.5">
          <span className="text-[13px] font-bold text-[#15345b]">이전 회차 대비</span>
          {changeSummary.improved > 0 ? (
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
              ▲ 개선 {changeSummary.improved}
            </span>
          ) : null}
          {changeSummary.regressed > 0 ? (
            <span className="rounded-[3px] border border-red-300 bg-white px-2.5 py-0.5 text-xs font-bold text-red-700">
              ▼ 하락 {changeSummary.regressed}
            </span>
          ) : null}
          {changeSummary.added > 0 ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
              신규 {changeSummary.added}
            </span>
          ) : null}
          <span className="text-xs text-[#94a3b8]">
            ({formatUploadDateTime(previousReview.reviewedAt)} 검토 기준)
          </span>
        </div>
      ) : null}

      {review.metrics && review.metrics.length > 0 ? (
        <div className="rounded-md border border-[#d7dee8] bg-white p-4">
          <p className="text-sm font-bold text-[#15345b]">사업 규모 (문서에서 자동 인식)</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {review.metrics.map((metric) => (
              <div className="rounded-lg bg-[#f8fafc] px-3 py-2 text-[13px]" key={metric.label}>
                <p className="font-bold text-[#475569]">{metric.label}</p>
                <p className="mt-0.5 font-semibold leading-5 text-[#172033]">{metric.value}</p>
                {metric.source ? (
                  <p className="mt-0.5 text-[11px] text-[#94a3b8]">
                    p.{metric.source.page}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs leading-5 text-[#94a3b8]">
            제출 문서에 명시된 값을 원문 그대로 추출한 결과입니다. 최종 수치는 도서 원본으로 확인해 주세요.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
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
        {reviewFlagCount > 0 ? (
          <span className="ml-1 inline-flex items-center gap-1 rounded-[4px] border border-amber-400 bg-white px-3 py-1.5 text-xs font-bold text-amber-800">
            직접 확인 필요 {reviewFlagCount}
          </span>
        ) : null}
      </div>

      <div className="space-y-6">
        {groupedItems.map(([category, items]) => (
          <div key={category}>
            <Eyebrow>{category}</Eyebrow>
            <ul className="mt-2 space-y-3">
              {items.map((item) => (
                <FindingCard
                  change={changesByItemId.get(item.id)}
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
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-bold text-amber-800">검토 참고</p>
          <ul className="mt-1.5 space-y-1 text-[13px] leading-5 text-amber-800">
            {review.warnings.map((warning) => (
              <li key={warning}>· {warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {review.referenceLaws.length > 0 ? (
        <details className="rounded-md border border-[#d7dee8] bg-white p-4">
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
      className={`inline-flex items-center gap-1.5 rounded-[4px] border px-3 py-1.5 text-xs font-bold transition ${
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
  change,
}: {
  item: ChecklistItem;
  finding?: ChecklistFinding;
  pageHref: (
    fileName: string,
    page: number,
    region?: { x: number; y: number; width: number; height: number },
  ) => { thumbSrc: string; fullSrc: string } | undefined;
  comment?: string;
  onSaveComment: (itemId: string, text: string) => Promise<void>;
  /** 직전 회차 대비 변화 (없으면 동일 or 첫 회차) */
  change?: ItemChange;
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
    <li className={`rounded-md border p-4 ${style.card}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm font-bold leading-6 text-[#172033]">{item.text}</p>
        <span className="flex shrink-0 items-center gap-1.5">
          {change ? (
            change.kind === "개선" ? (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700" title={`이전 회차: ${change.from}`}>
                ▲ {change.from}→
              </span>
            ) : change.kind === "하락" ? (
              <span className="rounded-[3px] border border-red-300 bg-white px-2 py-0.5 text-[11px] font-bold text-red-700" title={`이전 회차: ${change.from}`}>
                ▼ {change.from}→
              </span>
            ) : (
              <span className="rounded-[3px] border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500">신규</span>
            )
          ) : null}
          <span className={`rounded-[3px] border px-2.5 py-0.5 text-xs font-bold ${style.badge}`}>{status}</span>
          {finding?.reviewFlag ? (
            <span
              className="rounded-[3px] border border-amber-400 bg-white px-2 py-0.5 text-[11px] font-bold text-amber-800"
              title={finding.reviewFlag}
            >
              확인 필요
            </span>
          ) : null}
        </span>
      </div>

      {finding?.rationale || finding?.recommendation ? (
        <p className="mt-2 text-sm leading-6 text-[#475569]">
          {[finding?.rationale, finding?.recommendation].filter(Boolean).join(" ")}
        </p>
      ) : null}

      {finding && finding.evidence.length > 0 ? (
        <div className="mt-3 space-y-1.5">
          {finding.evidence.map((evidence, index) => {
            const snippet = pageHref(evidence.fileName, evidence.page, evidence.region);
            return (
              <div key={`${evidence.fileName}-${evidence.page}-${index}`}>
                <p className="text-[13px] leading-5 text-[#64748b]">
                  <span className="font-bold text-[#15345b]">
                    p.{evidence.page}
                  </span>{" "}
                  — {evidence.note}
                </p>
                {snippet ? (
                  <EvidenceSnippet
                    alt={`p.${evidence.page} 근거 캡처`}
                    fullSrc={snippet.fullSrc}
                    hasRegion={Boolean(evidence.region)}
                    thumbSrc={snippet.thumbSrc}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}


      {(finding && finding.lawRefs.length > 0) || (!editing && !comment) ? (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {(finding?.lawRefs ?? []).map((law) =>
            law.sourceUrl ? (
              <a
                className="rounded-[3px] border border-[#c9d6e6] bg-white px-2.5 py-0.5 text-xs font-bold text-[#2463b3] hover:underline"
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
                className="rounded-[3px] border border-[#c9d6e6] bg-white px-2.5 py-0.5 text-xs font-bold text-[#2463b3]"
                key={`${law.title}-${law.article ?? ""}`}
              >
                {law.title}
                {law.article ? ` ${law.article}` : ""}
              </span>
            ),
          )}
          {!editing && !comment ? (
            <button
              className="ml-auto rounded-[3px] border border-[#c9d6e6] bg-white px-2.5 py-0.5 text-xs font-bold text-[#2463b3] hover:bg-[#dcebfb]"
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
            className="w-full resize-y rounded-md border border-[#d7dee8] px-2.5 py-1.5 text-[13px] leading-5 text-[#172033] focus:border-[#2463b3] focus:outline-none"
            disabled={saving}
            maxLength={2000}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="이 항목에 대한 추가의견을 입력하세요"
            rows={2}
            value={draft}
          />
          {commentError ? <p className="mt-1 text-xs font-semibold text-red-600">{commentError}</p> : null}
          <div className="mt-1.5 flex items-center justify-end gap-1.5">
            {comment ? (
              <button
                className="rounded-md px-2.5 py-1 text-xs font-bold text-red-500 hover:bg-red-50 disabled:opacity-50"
                disabled={saving}
                onClick={() => void submitComment("")}
                type="button"
              >
                삭제
              </button>
            ) : null}
            <button
              className="rounded-md px-2.5 py-1 text-xs font-bold text-[#64748b] hover:bg-[#f1f5f9] disabled:opacity-50"
              disabled={saving}
              onClick={() => setEditing(false)}
              type="button"
            >
              취소
            </button>
            <button
              className="primary-action-blue rounded-md px-3 py-1 text-xs font-bold disabled:opacity-50"
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
            <p className="min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-5 text-[#334155]">
              <span className="mr-1.5 font-bold text-[#15345b]">추가의견</span>
              {comment}
            </p>
            <button
              className="shrink-0 rounded-md px-2 py-1 text-xs font-bold text-[#2463b3] hover:bg-[#eef4fb]"
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

/**
 * 근거 캡처 썸네일 — 첫 생성은 서버 렌더링(1~2초)이 걸리므로 로딩 중에는
 * 스켈레톤 + 진행 바를 보여주고, 완료되면 이미지를 페이드 인합니다.
 */
function EvidenceSnippet({
  thumbSrc,
  fullSrc,
  alt,
  hasRegion,
}: {
  thumbSrc: string;
  fullSrc: string;
  alt: string;
  hasRegion: boolean;
}) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // 일시적 실패(서버 생성 대기·순간 제한) 자동 회복 — 6초 후 최대 2회 재시도
  useEffect(() => {
    if (status !== "error" || retryCount >= 2) return;
    const timer = setTimeout(() => {
      setRetryCount((count) => count + 1);
      setStatus("loading");
    }, 6000);
    return () => clearTimeout(timer);
  }, [status, retryCount]);

  if (status === "error") {
    return (
      <p className="mt-1.5 rounded-lg border border-dashed border-[#d7dee8] bg-[#f8fafc] px-3 py-2 text-xs text-[#94a3b8]">
        캡처를 불러오지 못했습니다
      </p>
    );
  }

  return (
    <>
      <button
        className="relative mt-1.5 inline-block cursor-zoom-in text-left"
        onClick={() => setLightboxOpen(true)}
        title="클릭하면 크게 보기"
        type="button"
      >
      {status === "loading" ? (
        <span className="flex h-32 w-56 flex-col items-center justify-center gap-2 rounded-lg border border-[#d7dee8] bg-[#f1f5f9]">
          <span className="h-1 w-28 overflow-hidden rounded-full bg-[#dbe4ee]">
            <span className="block h-full w-1/3 animate-[snippet-loading_1.1s_ease-in-out_infinite] rounded-full bg-[#2463b3]" />
          </span>
          <span className="text-[11px] font-semibold text-[#94a3b8]">캡처 불러오는 중...</span>
        </span>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={alt}
        className={`max-h-44 max-w-full rounded-lg border shadow-sm transition-opacity duration-300 ${
          hasRegion ? "border-[#e2c5c5]" : "border-[#d7dee8]"
        } ${status === "loaded" ? "opacity-100" : "absolute h-0 w-0 opacity-0"}`}
        loading="lazy"
        onError={() => setStatus("error")}
        onLoad={() => setStatus("loaded")}
        ref={(node) => {
          // 브라우저 캐시에서 즉시 로드된 이미지는 onLoad가 핸들러 부착 전에 끝나
          // 이벤트가 오지 않음 — 마운트 시점에 완료 여부를 직접 확인 (새로고침 시
          // 로더가 계속 돌던 버그의 원인)
          if (node?.complete) {
            setStatus(node.naturalWidth > 0 ? "loaded" : "error");
          }
        }}
        src={retryCount > 0 ? `${thumbSrc}&retry=${retryCount}` : thumbSrc}
      />
      </button>
      {lightboxOpen ? (
        <SnippetLightbox alt={alt} onClose={() => setLightboxOpen(false)} placeholderSrc={thumbSrc} src={fullSrc} />
      ) : null}
    </>
  );
}

/** 캡처 확대 보기 — 배경을 어둡게 깔고 화면 위에 띄우는 라이트박스 (ESC·배경 클릭으로 닫힘) */
function SnippetLightbox({
  src,
  placeholderSrc,
  alt,
  onClose,
}: {
  src: string;
  /** 고해상도 로딩 동안 즉시 보여줄 저해상도(이미 캐시된 썸네일) */
  placeholderSrc: string;
  alt: string;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/75 p-4 sm:p-8"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
      role="dialog"
    >
      {!loaded ? (
        <>
          {/* 이미 캐시된 썸네일을 즉시 확대 표시 — 고해상도 도착 시 교체 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            aria-hidden
            className="max-h-[92vh] max-w-[94vw] cursor-default rounded-lg opacity-90 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            src={placeholderSrc}
          />
          <span className="pointer-events-none absolute bottom-8 flex flex-col items-center gap-1.5 text-white/90">
            <span className="h-1 w-32 overflow-hidden rounded-full bg-white/25">
              <span className="block h-full w-1/3 animate-[snippet-loading_1.1s_ease-in-out_infinite] rounded-full bg-white" />
            </span>
            <span className="text-xs font-semibold">고해상도 불러오는 중...</span>
          </span>
        </>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={alt}
        className={`max-h-[92vh] max-w-[94vw] cursor-default rounded-lg shadow-2xl transition-opacity duration-200 ${loaded ? "opacity-100" : "absolute h-0 w-0 opacity-0"}`}
        onClick={(event) => event.stopPropagation()}
        onLoad={() => setLoaded(true)}
        ref={(node) => {
          if (node?.complete && node.naturalWidth > 0) setLoaded(true);
        }}
        src={src}
      />
      <button
        aria-label="닫기"
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-xl font-bold text-white hover:bg-white/30"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        type="button"
      >
        ×
      </button>
    </div>
  );
}
