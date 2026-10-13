"use client";

import { memo as reactMemo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import WorkspaceSectionCard from "@/components/workspace-section-card";
import type { ExpertMemo, Project } from "@/lib/types";
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
}: {
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
  const color = tone === "previous" ? "#64748b" : "#b45309";

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
        } ${tone === "previous" ? "border-dashed border-[#94a3b8]" : "border-[#f2c48d]"}`}
      >
        {editing ? (
          <textarea
            autoFocus
            className="block h-16 w-[220px] resize-y rounded-[3px] border border-[#cbd5e1] p-1.5 text-xs leading-4 text-[#1e293b] outline-none focus:border-[#b45309]"
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
              editable ? "cursor-text hover:bg-[#fff8ed]" : ""
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
            <span className="font-semibold text-[#64748b]">{author}</span>
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
  versionPicker,
  activeVersion = null,
  versions = [],
}: {
  project: Project;
  /** 탭이 보일 때만 PDF를 받는다 */
  active?: boolean;
  versionPicker?: ReactNode;
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
    const current = draftRef.current;
    if (current.point && current.text.trim()) void createMemoRef.current(current.point, current.text.trim());
    draftRef.current = { point, text: "" };
    setDraft(point);
  }, []);

  // 페이지 위 핀·메모
  const pageMemos = versionMemos.filter((memo) => memo.page === page);
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
          author={memo.authorName}
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
  const previousCount = previousMemos.length;

  return (
    <WorkspaceSectionCard id="expert-review" title="사전심의: 전문가 분석" bare>
      <div className="mb-4 rounded-md border border-[#d7dee8] bg-white p-4">
        <p className="mb-3 text-sm font-bold text-[#15345b]">도서 버전</p>
        {versionPicker ?? <p className="text-xs text-[#94a3b8]">AI 분석 탭에서 PDF를 업로드하면 도서 버전이 만들어집니다.</p>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[136px_1fr]">
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
                  className="h-7 w-11 rounded-[4px] border border-[#d7dee8] text-center text-xs font-semibold outline-none focus:border-[#b45309]"
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
            <span className="ml-auto flex items-center gap-1.5 rounded-full bg-[#fff8ed] px-3 py-1 text-xs font-bold text-[#b45309]">
              📍 의견을 남길 곳을 클릭하세요
            </span>
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
                <div className="h-full bg-[#b45309]" style={{ width: `${Math.max(4, pdf.progress * 100)}%` }} />
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
            <span>내 의견은 글을 누르면 바로 수정할 수 있습니다</span>
            {message ? <span className="font-semibold text-[#b91c1c]">{message}</span> : null}
            <span className="ml-auto">메모는 저장 즉시 모든 검토자에게 공유됩니다</span>
          </div>
        </div>
      </div>
    </WorkspaceSectionCard>
  );
}
