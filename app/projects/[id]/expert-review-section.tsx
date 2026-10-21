"use client";

import { memo as reactMemo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import WorkspaceSectionCard from "@/components/workspace-section-card";
import type { ChecklistReview } from "@/lib/checklist-review/types";
import type { ExpertMemo, Project, ReviewerMarker } from "@/lib/types";
import { exportExpertPdf, type ExportMemo } from "./expert-export";
import ExpertPageNavigator from "./expert-page-navigator";
import ExpertPdfViewer, { useExpertPdf } from "./expert-pdf-viewer";

/**
 * 사전심의: 전문가 분석 — 도서 PDF 위 원하는 지점에 핀을 꽂고, 핀 바로 아래에 의견을 적는다.
 * - 메모는 작성자 이름과 함께 모두에게 공유, 수정·삭제는 본인(또는 관리자)만.
 * - 메모는 작성한 도서 버전에 묶이고, 보완 제출본에서는 이전 버전 의견을 회색 핀으로 참고할 수 있다.
 */

export type ExpertVersionInfo = {
  key: string;
  label: string;
  order: number;
  fileName: string;
  reviewId: string | null;
  fileId: string | null;
  /** 직전 버전 대비 바뀐 페이지 */
  changedPages: number[];
};

type Point = { x: number; y: number };

function shortDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("month")}.${get("day")} ${get("hour")}:${get("minute")}`;
}

/** 핀 위치 — 핀 메모는 (x, y) 그대로, 예전 박스 메모는 박스 위쪽 가운데 */
function pinPoint(memo: ExpertMemo): Point {
  const { x, y, width, height } = memo.region;
  if (width > 0.002 || height > 0.002) return { x: x + width / 2, y };
  return { x, y };
}

function byPosition(a: ExpertMemo, b: ExpertMemo) {
  return a.page - b.page || pinPoint(a).y - pinPoint(b).y || a.createdAt.localeCompare(b.createdAt);
}

/** 핀 + 그 아래 메모 카드. 본인 메모는 글을 누르면 바로 고칠 수 있다. */
const PinNote = reactMemo(function PinNote({
  point,
  label,
  text,
  author,
  time,
  tone,
  editable,
  startEditing = false,
  saving = false,
  onSave,
  onDelete,
  onCancelNew,
  onTextChange,
  color: colorProp,
}: {
  /** 심사위원 마커 색 */
  color?: string;
  point: Point;
  label: string;
  text: string;
  author: string;
  time: string;
  tone: "current" | "previous" | "draft";
  editable: boolean;
  startEditing?: boolean;
  saving?: boolean;
  onSave?: (text: string) => void;
  onDelete?: () => void;
  /** 새 핀 입력 취소 */
  onCancelNew?: () => void;
  /** 새 핀 입력 중인 글 (다른 곳을 눌러 다음 핀을 꽂을 때 자동 저장용) */
  onTextChange?: (text: string) => void;
}) {
  const [editing, setEditing] = useState(startEditing);
  const [value, setValue] = useState(text);
  const flipLeft = point.x > 0.72;
  // 페이지 아래쪽 핀은 메모를 핀 위로 띄워 화면 밖으로 잘리지 않게
  const flipUp = point.y > 0.75;
  const color = tone === "previous" ? "#64748b" : colorProp ?? "#111827";

  const finish = (commit: boolean) => {
    const next = value.trim();
    if (commit && next && next !== text) onSave?.(next);
    if (tone === "draft" && (!commit || !next)) onCancelNew?.();
    if (!commit) setValue(text);
    setEditing(false);
  };

  return (
    <div
      className="absolute"
      onMouseDown={(event) => event.stopPropagation()}
      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, zIndex: editing ? 20 : 10 }}
    >
      {/* 핀 — 끝이 정확히 그 지점을 가리킴 */}
      <svg aria-hidden className="absolute -translate-x-1/2 -translate-y-full drop-shadow" height="26" viewBox="0 0 20 26" width="20">
        <path d="M10 25.5C10 25.5 19 15.6 19 9.6A9 9 0 0 0 1 9.6C1 15.6 10 25.5 10 25.5Z" fill={color} stroke="white" strokeWidth="1.2" />
        <text fill="white" fontSize="9" fontWeight="700" textAnchor="middle" x="10" y="12.8">
          {label}
        </text>
      </svg>
      <div
        className={`absolute ${flipUp ? "bottom-[30px]" : "top-1"} w-max min-w-[120px] max-w-[240px] rounded-md border bg-white/95 px-2 py-1.5 text-left shadow-md ${
          flipLeft ? "right-[-10px]" : "left-[-10px]"
        } ${tone === "previous" ? "border-dashed border-[#94a3b8]" : ""}`}
        style={
          tone === "previous"
            ? undefined
            : { borderColor: `${color}55`, borderLeft: `4px solid ${color}`, background: `color-mix(in srgb, ${color} 7%, white)` }
        }
      >
        {editing ? (
          <textarea
            autoFocus
            className="block h-16 w-[220px] resize-y rounded-[3px] border border-[#cbd5e1] bg-white p-1.5 text-xs leading-4 text-[#1e293b] outline-none"
            style={{ outlineColor: color }}
            onBlur={() => finish(true)}
            onFocus={(event) => {
              // 커서를 글 끝으로
              const length = event.currentTarget.value.length;
              event.currentTarget.setSelectionRange(length, length);
            }}
            onChange={(event) => {
              setValue(event.target.value);
              onTextChange?.(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                finish(true);
              }
              if (event.key === "Escape") finish(false);
            }}
            placeholder="의견 입력 후 Enter (줄바꿈 Shift+Enter)"
            value={value}
          />
        ) : (
          <p
            className={`whitespace-pre-wrap text-xs leading-4 ${tone === "previous" ? "text-[#475569]" : "text-[#1e293b]"} ${
              editable ? "cursor-text rounded-[2px] hover:bg-white/70" : ""
            }`}
            onClick={() => {
              if (editable) {
                setValue(text);
                setEditing(true);
              }
            }}
            title={editable ? "눌러서 수정" : undefined}
          >
            {text}
          </p>
        )}
        {tone !== "draft" ? (
          <p className="mt-1 flex items-center gap-1.5 text-[10px] leading-3 text-[#94a3b8]">
            <span className="font-bold" style={{ color: tone === "previous" ? "#64748b" : color }}>
              {author}
            </span>
            <span>{saving ? "저장 중…" : time}</span>
            {editable && !editing && onDelete ? (
              <button
                className="ml-auto rounded-[2px] px-1 font-semibold text-[#b91c1c] hover:bg-[#fef2f2]"
                onClick={onDelete}
                type="button"
              >
                삭제
              </button>
            ) : null}
          </p>
        ) : null}
      </div>
    </div>
  );
});

export default function ExpertReviewSection({
  project,
  active = true,
  activeVersion = null,
  versions = [],
}: {
  project: Project;
  /** 탭이 보일 때만 PDF를 받는다 */
  active?: boolean;
  activeVersion?: ExpertVersionInfo | null;
  versions?: ExpertVersionInfo[];
}) {
  const [memos, setMemos] = useState<ExpertMemo[]>(project.expertMemos ?? []);
  const [me, setMe] = useState<{ id: string; isAdmin: boolean } | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [pageInput, setPageInput] = useState("1");
  const [draft, setDraft] = useState<Point | null>(null);
  const [showPrevious, setShowPrevious] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  // 본심의 심사위원 마커 — 공무원이 고른 위원 이름으로 의견이 기록됨
  const [reviewers, setReviewers] = useState<ReviewerMarker[]>(project.reviewers ?? []);
  const [activeReviewerId, setActiveReviewerId] = useState<string | null>(null);
  const [onlyActiveReviewer, setOnlyActiveReviewer] = useState(false);
  const activeReviewer = reviewers.find((reviewer) => reviewer.id === activeReviewerId) ?? null;
  const activeReviewerRef = useRef<ReviewerMarker | null>(null);
  useEffect(() => {
    activeReviewerRef.current = activeReviewer;
  }, [activeReviewer]);

  const saveReviewers = async (next: ReviewerMarker[]) => {
    const before = reviewers;
    setReviewers(next);
    try {
      const response = await fetch(`/api/projects/${project.id}/reviewers`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewers: next }),
      });
      const payload = (await response.json().catch(() => ({}))) as { reviewers?: ReviewerMarker[]; error?: string };
      if (!response.ok || !payload.reviewers) throw new Error(payload.error ?? "심사위원 목록을 저장하지 못했습니다.");
      setReviewers(payload.reviewers);
    } catch (error) {
      setReviewers(before);
      setMessage(error instanceof Error ? error.message : "심사위원 목록을 저장하지 못했습니다.");
    }
  };

  const pdf = useExpertPdf({
    projectId: project.id,
    reviewId: activeVersion?.reviewId ?? null,
    fileId: activeVersion?.fileId ?? null,
    enabled: active,
  });

  // 메모 + 현재 사용자 (탭을 열 때마다 최신으로 — 다른 전문가 메모 반영)
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/expert-memos?projectId=${encodeURIComponent(project.id)}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { memos: ExpertMemo[]; currentUserId: string; isAdmin: boolean };
      setMemos((prev) => [...payload.memos, ...prev.filter((memo) => memo.id.startsWith("pending-"))]);
      setMe({ id: payload.currentUserId, isAdmin: payload.isAdmin });
    } catch {
      // 네트워크 오류 시 기존 목록 유지
    }
  }, [project.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (active) void refresh();
  }, [active, refresh]);

  const versionKey = activeVersion?.key ?? null;
  useEffect(() => {
    // 버전이 바뀌면 첫 페이지로
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
    setPageInput("1");
    setDraft(null);
    setPageCount(0);
  }, [versionKey]);

  const goToPage = useCallback(
    (next: number) => {
      const clamped = Math.max(1, Math.min(pageCount || next, next));
      setPage(clamped);
      setPageInput(String(clamped));
      setDraft(null);
    },
    [pageCount],
  );

  const versionMemos = useMemo(
    () => memos.filter((memo) => memo.versionKey === versionKey).sort(byPosition),
    [memos, versionKey],
  );
  const versionByKey = useMemo(() => new Map(versions.map((version) => [version.key, version])), [versions]);
  const previousMemos = useMemo(() => {
    if (!activeVersion) return [];
    return memos.filter((memo) => {
      const version = versionByKey.get(memo.versionKey);
      return memo.versionKey !== activeVersion.key && version && version.order < activeVersion.order;
    });
  }, [memos, activeVersion, versionByKey]);

  const reviewerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const memo of versionMemos) if (memo.reviewerId) counts.set(memo.reviewerId, (counts.get(memo.reviewerId) ?? 0) + 1);
    return counts;
  }, [versionMemos]);
  const aiReview = useMemo(
    () => (project.checklistReviews ?? []).find((review) => review.id === activeVersion?.reviewId) ?? null,
    [project.checklistReviews, activeVersion?.reviewId],
  );

  const memoCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const memo of versionMemos) counts.set(memo.page, (counts.get(memo.page) ?? 0) + 1);
    return counts;
  }, [versionMemos]);
  const changedPageSet = useMemo(() => new Set(activeVersion?.changedPages ?? []), [activeVersion?.changedPages]);
  const memoPages = useMemo(() => [...memoCounts.keys()], [memoCounts]);

  const canEdit = (memo: ExpertMemo) =>
    Boolean(me && (memo.authorId === me.id || me.isAdmin)) && !memo.id.startsWith("pending-");

  const createMemo = async (point: Point, text: string) => {
    if (!activeVersion?.reviewId || !activeVersion.fileId || !me) return;
    const reviewer = activeReviewerRef.current;
    const region = { x: point.x, y: point.y, width: 0, height: 0 };
    const tempId = `pending-${Date.now()}`;
    const optimistic: ExpertMemo = {
      id: tempId,
      versionKey: activeVersion.key,
      reviewId: activeVersion.reviewId,
      fileId: activeVersion.fileId,
      fileName: activeVersion.fileName,
      page,
      region,
      text,
      authorId: me.id,
      authorName: "나",
      ...(reviewer ? { reviewerId: reviewer.id, reviewerName: reviewer.name, reviewerColor: reviewer.color } : {}),
      createdAt: new Date().toISOString(),
    };
    setMemos((prev) => [...prev, optimistic]);
    setDraft(null);
    setMessage(null);
    try {
      const response = await fetch("/api/expert-memos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          versionKey: activeVersion.key,
          reviewId: activeVersion.reviewId,
          fileId: activeVersion.fileId,
          page,
          region,
          text,
          reviewerId: reviewer?.id,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { memo?: ExpertMemo; error?: string };
      const saved = payload.memo;
      if (!response.ok || !saved) throw new Error(payload.error ?? "메모를 저장하지 못했습니다.");
      setMemos((prev) => prev.map((memo) => (memo.id === tempId ? saved : memo)));
    } catch (error) {
      setMemos((prev) => prev.filter((memo) => memo.id !== tempId));
      setMessage(error instanceof Error ? error.message : "메모를 저장하지 못했습니다.");
    }
  };

  const updateMemo = async (memo: ExpertMemo, text: string) => {
    setMemos((prev) => prev.map((entry) => (entry.id === memo.id ? { ...entry, text } : entry)));
    setMessage(null);
    try {
      const response = await fetch("/api/expert-memos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, memoId: memo.id, text }),
      });
      const payload = (await response.json().catch(() => ({}))) as { memo?: ExpertMemo; error?: string };
      const saved = payload.memo;
      if (!response.ok || !saved) throw new Error(payload.error ?? "메모를 수정하지 못했습니다.");
      setMemos((prev) => prev.map((entry) => (entry.id === saved.id ? saved : entry)));
    } catch (error) {
      setMemos((prev) => prev.map((entry) => (entry.id === memo.id ? memo : entry)));
      setMessage(error instanceof Error ? error.message : "메모를 수정하지 못했습니다.");
    }
  };

  const deleteMemo = async (memo: ExpertMemo) => {
    if (!window.confirm("이 의견을 삭제할까요?")) return;
    setMemos((prev) => prev.filter((entry) => entry.id !== memo.id));
    setMessage(null);
    try {
      const query = new URLSearchParams({ projectId: project.id, memoId: memo.id });
      const response = await fetch(`/api/expert-memos?${query}`, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "메모를 삭제하지 못했습니다.");
    } catch (error) {
      setMemos((prev) => (prev.some((entry) => entry.id === memo.id) ? prev : [...prev, memo]));
      setMessage(error instanceof Error ? error.message : "메모를 삭제하지 못했습니다.");
    }
  };

  // 페이지를 누르면 새 핀 — 입력 중이던 핀이 있으면 그 글은 저장하고 새 핀으로
  const draftRef = useRef<{ point: Point | null; text: string }>({ point: null, text: "" });
  useEffect(() => {
    draftRef.current.point = draft;
    if (!draft) draftRef.current.text = "";
  }, [draft]);
  const createMemoRef = useRef(createMemo);
  useEffect(() => {
    createMemoRef.current = createMemo;
  });
  const onPageClick = useCallback((point: Point) => {
    if (!activeReviewerRef.current) {
      setMessage("먼저 위에서 의견을 낼 심사위원을 선택하세요.");
      return;
    }
    setMessage(null);
    const current = draftRef.current;
    if (current.point && current.text.trim()) void createMemoRef.current(current.point, current.text.trim());
    draftRef.current = { point, text: "" };
    setDraft(point);
  }, []);

  // 페이지 위 핀·메모
  const pageMemos = versionMemos.filter(
    (memo) => memo.page === page && (!onlyActiveReviewer || !activeReviewerId || memo.reviewerId === activeReviewerId),
  );
  const previousOnPage = showPrevious ? previousMemos.filter((memo) => memo.page === page) : [];
  const overlay = (
    <>
      {previousOnPage.map((memo) => (
        <PinNote
          author={memo.authorName}
          editable={false}
          key={memo.id}
          label="이"
          point={pinPoint(memo)}
          text={memo.text}
          time={`${versionByKey.get(memo.versionKey)?.label ?? "이전"} · ${shortDateTime(memo.updatedAt ?? memo.createdAt)}`}
          tone="previous"
        />
      ))}
      {pageMemos.map((memo, index) => (
        <PinNote
          author={memo.reviewerName ? `${memo.reviewerName} 위원` : memo.authorName}
          color={memo.reviewerColor}
          editable={canEdit(memo)}
          key={memo.id}
          label={String(index + 1)}
          onDelete={() => void deleteMemo(memo)}
          onSave={(text) => void updateMemo(memo, text)}
          point={pinPoint(memo)}
          saving={memo.id.startsWith("pending-")}
          text={memo.text}
          time={shortDateTime(memo.updatedAt ?? memo.createdAt)}
          tone="current"
        />
      ))}
      {draft ? (
        <PinNote
          author=""
          editable
          key={`draft-${draft.x}-${draft.y}`}
          color={activeReviewer?.color}
          label="+"
          // 다른 곳을 눌러 새 핀으로 넘어간 뒤 뒤늦게 오는 이벤트는 무시 (중복 저장·새 핀 취소 방지)
          onCancelNew={() => {
            if (draftRef.current.point === draft) setDraft(null);
          }}
          onSave={(text) => {
            if (draftRef.current.point === draft) void createMemo(draft, text);
          }}
          onTextChange={(text) => {
            draftRef.current.text = text;
          }}
          point={draft}
          startEditing
          text=""
          time=""
          tone="draft"
        />
      ) : null}
    </>
  );

  const hasFile = Boolean(activeVersion?.reviewId && activeVersion.fileId);

  // 전문가 분석 다운로드 — 원본 PDF 위에 화면 그대로 핀·의견을 새겨 저장
  const downloadExpertPdf = async () => {
    if (!pdf.doc || exporting) return;
    const byPage = new Map<number, ExportMemo[]>();
    for (const memo of versionMemos) {
      if (memo.id.startsWith("pending-")) continue;
      const list = byPage.get(memo.page) ?? [];
      list.push({ memo, label: String(list.length + 1), point: pinPoint(memo), color: memo.reviewerColor });
      byPage.set(memo.page, list);
    }
    const base = (activeVersion?.fileName ?? "도서").replace(/\.pdf$/i, "");
    setExporting("준비 중…");
    setMessage(null);
    try {
      await exportExpertPdf({
        doc: pdf.doc,
        byPage,
        fileName: `${base}_본심의_전문가분석.pdf`,
        onProgress: (done, total) => setExporting(`${done}/${total}쪽`),
      });
    } catch (error) {
      setMessage(error instanceof Error ? `다운로드 실패: ${error.message}` : "다운로드에 실패했습니다.");
    } finally {
      setExporting(null);
    }
  };
  const previousCount = previousMemos.length;

  return (
    <WorkspaceSectionCard id="expert-review" title="본심의: 인간 전문가 분석" bare>
      <ReviewerBar
        activeId={activeReviewerId}
        counts={reviewerCounts}
        finalLabel={activeVersion ? `${activeVersion.label} · ${activeVersion.fileName}` : null}
        onlyActive={onlyActiveReviewer}
        onChange={(next) => void saveReviewers(next)}
        onSelect={(id) => {
          setActiveReviewerId(id);
          setDraft(null);
          setMessage(null);
        }}
        onToggleOnly={setOnlyActiveReviewer}
        reviewers={reviewers}
      />

      <div className="grid gap-4 xl:grid-cols-[136px_1fr_300px]">
        {/* 페이지 네비게이터 (썸네일 + 메모 개수) */}
        <div className="relative hidden min-h-0 flex-col rounded-md border border-[#d7dee8] bg-white xl:flex">
          <p className="border-b border-[#e2e8f0] px-3 py-2.5 text-xs font-bold text-[#15345b]">
            페이지 <span className="font-medium text-[#94a3b8]">{pageCount || ""}</span>
          </p>
          {pdf.doc ? (
            <ExpertPageNavigator
              changedPages={changedPageSet}
              counts={memoCounts}
              doc={pdf.doc}
              onSelect={goToPage}
              page={page}
            />
          ) : (
            <p className="px-3 py-6 text-center text-[11px] text-[#94a3b8]">불러오는 중…</p>
          )}
        </div>

        {/* PDF 뷰어 */}
        <div className="min-w-0 rounded-md border border-[#d7dee8] bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#e2e8f0] px-3 py-2">
            <div className="flex items-center gap-1 text-xs text-[#475569]">
              <button className="h-8 w-8 rounded-[4px] hover:bg-[#f1f5f9] disabled:opacity-30" disabled={page <= 1} onClick={() => goToPage(page - 1)} title="이전 페이지" type="button">
                ◀
              </button>
              <form
                className="flex items-center gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = Number(pageInput);
                  if (Number.isFinite(value)) goToPage(Math.round(value));
                }}
              >
                <input
                  aria-label="페이지 번호"
                  className="h-7 w-11 rounded-[4px] border border-[#d7dee8] text-center text-xs font-semibold outline-none focus:border-[#111827]"
                  inputMode="numeric"
                  onBlur={() => setPageInput(String(page))}
                  onChange={(event) => setPageInput(event.target.value)}
                  value={pageInput}
                />
                <span className="font-semibold">/ {pageCount || "—"}</span>
              </form>
              <button
                className="h-8 w-8 rounded-[4px] hover:bg-[#f1f5f9] disabled:opacity-30"
                disabled={pageCount > 0 && page >= pageCount}
                onClick={() => goToPage(page + 1)}
                title="다음 페이지"
                type="button"
              >
                ▶
              </button>
              {changedPageSet.has(page) ? (
                <span className="ml-1 rounded-[3px] bg-[#fef3c7] px-1.5 py-0.5 text-[11px] font-semibold text-[#92400e]">이전 버전 대비 변경</span>
              ) : null}
            </div>
            <span
              className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
              style={
                activeReviewer
                  ? { color: activeReviewer.color, background: `color-mix(in srgb, ${activeReviewer.color} 10%, white)` }
                  : { color: "#64748b", background: "#f1f5f9" }
              }
            >
              {activeReviewer ? `📍 ${activeReviewer.name} 위원 의견 — 남길 곳을 클릭하세요` : "👤 심사위원을 먼저 선택하세요"}
            </span>
            <button
              className="inline-flex items-center rounded-lg bg-[#111827] px-3.5 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50"
              disabled={!pdf.doc || Boolean(exporting)}
              onClick={() => void downloadExpertPdf()}
              title="원본 도서에 핀과 의견을 새긴 PDF로 저장합니다"
              type="button"
            >
              {exporting ? `만드는 중… ${exporting}` : "전문가 분석 다운로드"}
            </button>
            {previousCount > 0 ? (
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-[#475569]">
                <input checked={showPrevious} onChange={(event) => setShowPrevious(event.target.checked)} type="checkbox" />
                이전 버전 의견 {previousCount}건
              </label>
            ) : null}
          </div>

          {!hasFile ? (
            <div className="flex min-h-[560px] items-center justify-center bg-[#eef1f5] p-6 text-center text-sm text-[#64748b]">
              AI 분석 탭에서 도서 PDF를 업로드하면 이곳에서 열람·표시할 수 있습니다.
            </div>
          ) : pdf.error ? (
            <div className="flex min-h-[560px] flex-col items-center justify-center gap-2 bg-[#eef1f5] p-6 text-center text-sm text-[#b91c1c]">
              도서를 열지 못했습니다.
              <span className="text-xs text-[#64748b]">{pdf.error}</span>
            </div>
          ) : !pdf.doc ? (
            <div className="flex min-h-[560px] flex-col items-center justify-center gap-3 bg-[#eef1f5] p-6 text-sm text-[#475569]">
              도서를 불러오는 중… {pdf.progress > 0 ? `${Math.round(pdf.progress * 100)}%` : ""}
              <div className="h-1.5 w-56 overflow-hidden rounded-full bg-[#d7dee8]">
                <div className="h-full bg-[#111827]" style={{ width: `${Math.max(4, pdf.progress * 100)}%` }} />
              </div>
            </div>
          ) : (
            <ExpertPdfViewer
              doc={pdf.doc}
              onPageClick={onPageClick}
              onPageCount={setPageCount}
              overlay={overlay}
              page={page}
              pinMode
              prefetchPages={memoPages}
              zoom={1}
            />
          )}

          <div className="flex items-center gap-3 border-t border-[#e2e8f0] px-3 py-2 text-[11px] text-[#94a3b8]">
            <span>의견 글을 누르면 바로 수정할 수 있습니다</span>
            {message ? <span className="font-semibold text-[#b91c1c]">{message}</span> : null}
            <span className="ml-auto">저장 즉시 공유됩니다</span>
          </div>
        </div>

        {/* AI 에이전트 분석 결과 — 이 페이지를 근거로 한 판정 */}
        <AiFindingsPanel onGoToPage={goToPage} page={page} review={aiReview} />
      </div>
    </WorkspaceSectionCard>
  );
}

/** 심사위원 마커 색 (20명 이상도 구분되도록) */
const REVIEWER_COLORS = [
  "#2563eb", "#059669", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#b45309", "#4f46e5", "#ea580c",
  "#0d9488", "#be123c", "#9333ea", "#0284c7", "#ca8a04", "#16a34a", "#c026d3", "#e11d48", "#2dd4bf", "#78716c",
];

/** 본심의 심사위원 선택·관리 — 이름표를 눌러 선택, ×로 제거, 점선 [+] 이름표로 추가 */
function ReviewerBar({
  reviewers,
  activeId,
  counts,
  onlyActive,
  finalLabel,
  onSelect,
  onChange,
  onToggleOnly,
}: {
  reviewers: ReviewerMarker[];
  activeId: string | null;
  counts: Map<string, number>;
  onlyActive: boolean;
  finalLabel: string | null;
  onSelect: (id: string | null) => void;
  onChange: (next: ReviewerMarker[]) => void;
  onToggleOnly: (value: boolean) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const add = () => {
    const names = name
      .split(/[,\n]/)
      .map((value) => value.trim())
      .filter(Boolean);
    setName("");
    setAdding(false);
    if (names.length === 0) return;
    const next = [...reviewers];
    const skipped: string[] = [];
    let lastAdded: string | null = null;
    for (const entry of names) {
      // 띄어쓰기·대소문자 차이까지 같은 이름으로 보고 중복 추가하지 않음
      if (next.some((reviewer) => sameReviewerName(reviewer.name, entry))) {
        skipped.push(entry);
        continue;
      }
      // 이미 쓰는 색은 피해서 배정
      const used = new Set(next.map((reviewer) => reviewer.color));
      const color = REVIEWER_COLORS.find((candidate) => !used.has(candidate)) ?? REVIEWER_COLORS[next.length % REVIEWER_COLORS.length];
      const id = `rv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      next.push({ id, name: entry, color });
      lastAdded = id;
    }
    if (skipped.length > 0) window.alert(`이미 있는 위원은 추가하지 않았습니다: ${skipped.join(", ")}`);
    if (next.length !== reviewers.length) onChange(next);
    if (lastAdded && names.length === 1) onSelect(lastAdded);
  };

  return (
    <div className="mb-4 rounded-md border border-[#d7dee8] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-[#15345b]">
          심사위원 <span className="font-medium text-[#94a3b8]">{reviewers.length}명 · 이름표를 눌러 선택한 뒤 도서에 의견을 남기세요</span>
        </p>
        <div className="flex items-center gap-3 text-xs text-[#475569]">
          {finalLabel ? <span className="truncate text-[#94a3b8]">최종 도서: {finalLabel}</span> : null}
          <label className="flex cursor-pointer items-center gap-1.5">
            <input checked={onlyActive} onChange={(event) => onToggleOnly(event.target.checked)} type="checkbox" />
            선택한 위원 의견만 보기
          </label>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {reviewers.map((reviewer) => {
          const selected = reviewer.id === activeId;
          const count = counts.get(reviewer.id) ?? 0;
          return (
            <span className="group relative" key={reviewer.id}>
              <button
                className={`flex h-10 items-center gap-2 rounded-full border-2 pl-1.5 pr-3.5 text-sm font-bold transition ${
                  selected ? "text-white shadow-md" : "text-[#334155] hover:shadow-sm"
                }`}
                onClick={() => onSelect(selected ? null : reviewer.id)}
                style={
                  selected
                    ? { background: reviewer.color, borderColor: reviewer.color }
                    : { borderColor: `${reviewer.color}66`, background: `color-mix(in srgb, ${reviewer.color} 8%, white)` }
                }
                type="button"
              >
                <span className="h-6 w-6 rounded-full border-2 border-white shadow-sm" style={{ background: reviewer.color }} />
                {reviewer.name}
                <span className={`text-xs font-semibold ${selected ? "text-white/85" : "text-[#94a3b8]"}`}>{count}</span>
              </button>
              <button
                aria-label={`${reviewer.name} 위원 제거`}
                className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full border border-white bg-[#475569] text-[11px] font-bold leading-none text-white shadow group-hover:flex hover:bg-[#b91c1c]"
                onClick={() => {
                  if (count > 0 && !window.confirm(`${reviewer.name} 위원을 목록에서 뺄까요? 이미 남긴 의견 ${count}건은 그대로 남습니다.`)) return;
                  if (reviewer.id === activeId) onSelect(null);
                  onChange(reviewers.filter((entry) => entry.id !== reviewer.id));
                }}
                title="위원 제거"
                type="button"
              >
                ×
              </button>
            </span>
          );
        })}

        {/* 추가용 빈 이름표 (스켈레톤) */}
        {adding ? (
          <span className="flex h-10 items-center gap-1 rounded-full border-2 border-[#2463b3] bg-white pl-3 pr-1">
            <input
              autoFocus
              className="w-44 bg-transparent text-sm outline-none"
              onBlur={() => add()}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  add();
                }
                if (event.key === "Escape") {
                  setName("");
                  setAdding(false);
                }
              }}
              placeholder="위원 이름 (쉼표로 여러 명)"
              value={name}
            />
            <button
              className="flex h-7 w-7 items-center justify-center rounded-full bg-[#2463b3] text-base font-bold text-white"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => add()}
              title="추가"
              type="button"
            >
              ✓
            </button>
          </span>
        ) : (
          <button
            className="flex h-10 items-center gap-2 rounded-full border-2 border-dashed border-[#9db6d8] bg-[#f8fbff] pl-1.5 pr-4 text-sm font-bold text-[#2463b3] transition hover:border-[#2463b3] hover:bg-[#eef4fb]"
            onClick={() => setAdding(true)}
            title="심사위원 추가"
            type="button"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-[#9db6d8] text-base leading-none">+</span>
            {reviewers.length === 0 ? "심사위원 추가" : "추가"}
          </button>
        )}
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  충족: "bg-[#ecfdf5] text-[#047857]",
  부분충족: "bg-[#fff8ed] text-[#b45309]",
  미충족: "bg-[#fef2f2] text-[#b91c1c]",
  확인불가: "bg-[#f1f5f9] text-[#475569]",
};

/** 본심의 오른쪽 — AI 에이전트 분석 결과 (현재 페이지 근거 / 전체) */
function AiFindingsPanel({
  review,
  page,
  onGoToPage,
}: {
  review: ChecklistReview | null;
  page: number;
  onGoToPage: (page: number) => void;
}) {
  const [scope, setScope] = useState<"page" | "all">("page");
  const itemsById = useMemo(() => new Map((review?.items ?? []).map((item) => [item.id, item])), [review]);
  const findings = review?.findings ?? [];
  const onPage = findings.filter((finding) => finding.evidence.some((evidence) => evidence.page === page));
  const listed = scope === "page" ? onPage : findings;

  return (
    <div className="flex min-h-0 flex-col rounded-md border border-[#c9d6e6] bg-white xl:max-h-[calc(100vh-120px)]">
      <div className="border-b border-[#e2e8f0] px-3 py-2.5">
        <p className="text-xs font-bold text-[#2463b3]">AI 에이전트 분석</p>
        {review ? (
          <p className="mt-1 flex flex-wrap gap-1 text-[10px]">
            {(["충족", "부분충족", "미충족", "확인불가"] as const).map((status) => (
              <span className={`rounded-[3px] px-1.5 py-0.5 font-bold ${STATUS_STYLE[status]}`} key={status}>
                {status} {review.counts[status]}
              </span>
            ))}
          </p>
        ) : null}
        <div className="mt-2 flex gap-1 text-[11px]">
          {(
            [
              ["page", `이 페이지 근거 ${onPage.length}`],
              ["all", `전체 ${findings.length}`],
            ] as const
          ).map(([id, label]) => (
            <button
              className={`rounded-full px-2.5 py-1 font-bold ${scope === id ? "bg-[#2463b3] text-white" : "bg-[#f1f5f9] text-[#475569]"}`}
              key={id}
              onClick={() => setScope(id)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {!review ? (
          <p className="px-1 py-6 text-center text-xs text-[#94a3b8]">이 도서의 AI 분석 결과가 없습니다.</p>
        ) : listed.length === 0 ? (
          <p className="px-1 py-6 text-center text-xs text-[#94a3b8]">이 페이지를 근거로 한 AI 판정이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {listed.map((finding) => {
              const item = itemsById.get(finding.itemId);
              const pages = [...new Set(finding.evidence.map((evidence) => evidence.page))].sort((a, b) => a - b);
              return (
                <li className="rounded-md border border-[#e2e8f0] p-2.5" key={finding.itemId}>
                  <div className="flex items-start gap-1.5">
                    <span className={`shrink-0 rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold ${STATUS_STYLE[finding.status]}`}>{finding.status}</span>
                    <p className="line-clamp-3 text-xs font-semibold leading-4 text-[#1e293b]">{item?.text ?? finding.itemId}</p>
                  </div>
                  <p className="mt-1.5 line-clamp-4 text-[11px] leading-4 text-[#475569]">{finding.rationale}</p>
                  {pages.length > 0 ? (
                    <p className="mt-1.5 flex flex-wrap gap-1">
                      {pages.map((evidencePage) => (
                        <button
                          className={`rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold ${
                            evidencePage === page ? "bg-[#2463b3] text-white" : "bg-[#eef4fb] text-[#2463b3] hover:bg-[#dbe8f7]"
                          }`}
                          key={evidencePage}
                          onClick={() => onGoToPage(evidencePage)}
                          type="button"
                        >
                          p.{evidencePage}
                        </button>
                      ))}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function sameReviewerName(a: string, b: string): boolean {
  const normalize = (value: string) => value.replace(/\s+/g, "").toLowerCase();
  return normalize(a) === normalize(b);
}
