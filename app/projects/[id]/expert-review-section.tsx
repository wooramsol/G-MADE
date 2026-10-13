"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import WorkspaceSectionCard from "@/components/workspace-section-card";
import type { ExpertMemo, Project } from "@/lib/types";
import ExpertPdfViewer, { nextZoom, useExpertPdf, type Region, type ViewerBox, type ViewerTool } from "./expert-pdf-viewer";

/**
 * 사전심의: 전문가 분석 — 전문가가 도서 PDF 위에 영역을 표시하고 의견 메모를 남긴다.
 * - 메모는 작성자 이름과 함께 모두에게 공유, 수정·삭제는 본인(또는 관리자)만.
 * - 메모는 작성한 도서 버전에 묶이고, 보완 제출본에서는 이전 버전 메모를 참고로 볼 수 있다.
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

const TOOLS: Array<{ id: ViewerTool; label: string; icon: string; hint: string }> = [
  { id: "select", label: "선택", icon: "↖", hint: "메모 박스를 눌러 내용 확인" },
  { id: "box", label: "영역 표시", icon: "▭", hint: "드래그해서 영역을 그리고 메모 작성" },
];

function shortDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}.${get("month")}.${get("day")} ${get("hour")}:${get("minute")}`;
}

function byPageThenTime(a: ExpertMemo, b: ExpertMemo) {
  return a.page - b.page || a.region.y - b.region.y || a.createdAt.localeCompare(b.createdAt);
}

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
  const [tool, setTool] = useState<ViewerTool>("box");
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [pageInput, setPageInput] = useState("1");
  const [zoom, setZoom] = useState(1);
  const [listTab, setListTab] = useState<"all" | "page">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Region | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [showPrevious, setShowPrevious] = useState(true);

  const pdf = useExpertPdf({
    projectId: project.id,
    reviewId: activeVersion?.reviewId ?? null,
    fileId: activeVersion?.fileId ?? null,
    enabled: active,
  });

  // 메모 목록 + 현재 사용자 (탭을 열 때마다 최신으로 — 다른 전문가 메모 반영)
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/expert-memos?projectId=${encodeURIComponent(project.id)}`, { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { memos: ExpertMemo[]; currentUserId: string; isAdmin: boolean };
      // 저장 중인 메모는 유지 (서버 목록에 아직 없음)
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

  // 버전이 바뀌면 첫 페이지·선택 초기화
  const versionKey = activeVersion?.key ?? null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPage(1);
    setPageInput("1");
    setSelectedId(null);
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
    () => memos.filter((memo) => memo.versionKey === versionKey).sort(byPageThenTime),
    [memos, versionKey],
  );
  const numberOf = useMemo(() => new Map(versionMemos.map((memo, index) => [memo.id, index + 1])), [versionMemos]);
  const versionByKey = useMemo(() => new Map(versions.map((version) => [version.key, version])), [versions]);
  const previousMemos = useMemo(() => {
    if (!activeVersion) return [];
    return memos
      .filter((memo) => {
        const version = versionByKey.get(memo.versionKey);
        return memo.versionKey !== activeVersion.key && version && version.order < activeVersion.order;
      })
      .sort((a, b) => (versionByKey.get(b.versionKey)?.order ?? 0) - (versionByKey.get(a.versionKey)?.order ?? 0) || byPageThenTime(a, b));
  }, [memos, activeVersion, versionByKey]);

  const listed = listTab === "page" ? versionMemos.filter((memo) => memo.page === page) : versionMemos;
  const selectedPrevious = previousMemos.find((memo) => memo.id === selectedId) ?? null;

  const boxes: ViewerBox[] = useMemo(
    () => [
    ...versionMemos
      .filter((memo) => memo.page === page)
      .map((memo) => ({
        id: memo.id,
        region: memo.region,
        label: String(numberOf.get(memo.id) ?? ""),
        kind: "current" as const,
        selected: memo.id === selectedId,
      })),
    ...(selectedPrevious && selectedPrevious.page === page
      ? [
          {
            id: selectedPrevious.id,
            region: selectedPrevious.region,
            label: `이전 의견 · ${versionByKey.get(selectedPrevious.versionKey)?.label ?? ""}`,
            kind: "previous" as const,
            selected: true,
          },
        ]
      : []),
  ],
    [versionMemos, page, numberOf, selectedId, selectedPrevious, versionByKey],
  );

  const onDraftComplete = useCallback((region: Region) => {
    setDraft(region);
    setSelectedId(null);
  }, []);
  const onSelectBox = useCallback((id: string) => {
    setSelectedId(id);
    // 목록에서 해당 메모 카드가 보이도록
    window.setTimeout(() => {
      document.querySelector(`[data-memo-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest" });
    }, 0);
  }, []);

  const canEdit = (memo: ExpertMemo) => Boolean(me && (memo.authorId === me.id || me.isAdmin));

  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null);
  const selectMemo = (memo: ExpertMemo) => {
    setSelectedId(memo.id);
    setDraft(null);
    setFocus((prev) => ({ id: memo.id, nonce: (prev?.nonce ?? 0) + 1 }));
    if (memo.page !== page) goToPage(memo.page);
  };
  const memoPages = useMemo(
    () => [...new Set([...versionMemos, ...previousMemos].map((memo) => memo.page))],
    [versionMemos, previousMemos],
  );

  const saveDraft = async (text: string) => {
    if (!draft || !activeVersion?.reviewId || !activeVersion.fileId || !text.trim() || !me) return;
    // 낙관적 반영 — 서버 저장을 기다리지 않고 바로 목록·박스에 표시
    const tempId = `pending-${Date.now()}`;
    const optimistic: ExpertMemo = {
      id: tempId,
      versionKey: activeVersion.key,
      reviewId: activeVersion.reviewId,
      fileId: activeVersion.fileId,
      fileName: activeVersion.fileName,
      page,
      region: draft,
      text: text.trim(),
      authorId: me.id,
      authorName: "저장 중…",
      createdAt: new Date().toISOString(),
    };
    setMemos((prev) => [...prev, optimistic]);
    setSelectedId(tempId);
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
          region: draft,
          text,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { memo?: ExpertMemo; memos?: ExpertMemo[]; error?: string };
      const saved = payload.memo;
      if (!response.ok || !saved) throw new Error(payload.error ?? "메모를 저장하지 못했습니다.");
      // 이 메모만 교체 — 그 사이 만든 다른 메모(저장 중 포함)는 그대로 둠
      setMemos((prev) => prev.map((memo) => (memo.id === tempId ? saved : memo)));
      setSelectedId((current) => (current === tempId ? payload.memo?.id ?? null : current));
    } catch (error) {
      setMemos((prev) => prev.filter((memo) => memo.id !== tempId));
      setMessage(error instanceof Error ? error.message : "메모를 저장하지 못했습니다.");
    }
  };

  const saveEdit = async (memo: ExpertMemo) => {
    if (!editText.trim()) return;
    setMemos((prev) => prev.map((entry) => (entry.id === memo.id ? { ...entry, text: editText.trim() } : entry)));
    setEditingId(null);
    setMessage(null);
    try {
      const response = await fetch("/api/expert-memos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, memoId: memo.id, text: editText }),
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

  const remove = async (memo: ExpertMemo) => {
    if (!window.confirm("이 메모를 삭제할까요?")) return;
    setMemos((prev) => prev.filter((entry) => entry.id !== memo.id));
    if (selectedId === memo.id) setSelectedId(null);
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

  const changedPages = new Set(activeVersion?.changedPages ?? []);

  const memoCard = (memo: ExpertMemo, previous: boolean) => {
    const selected = memo.id === selectedId;
    const editing = editingId === memo.id;
    const mine = me?.id === memo.authorId;
    return (
      <li
        className={`cursor-pointer rounded-md border p-3 text-left ${
          selected
            ? previous
              ? "border-[#64748b] bg-[#f1f5f9]"
              : "border-[#b45309] bg-[#fff8ed]"
            : "border-[#e2e8f0] bg-white hover:border-[#cbd5e1]"
        }`}
        data-memo-id={memo.id}
        key={memo.id}
        // 카드 어디를 눌러도 해당 메모로 이동 (수정 중에는 제외)
        // 버튼을 뗄 때(click)가 아니라 누르는 순간(mousedown) 반응 — 체감 지연 제거
        onMouseDown={(event) => {
          if (event.button === 0 && !editing) selectMemo(memo);
        }}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.key === " ") && !editing) {
            event.preventDefault();
            selectMemo(memo);
          }
        }}
        tabIndex={0}
      >
        <div className="block w-full text-left">
          <span className="flex items-center gap-2 text-[11px]">
            <span
              className={`flex h-5 min-w-5 items-center justify-center rounded-[3px] px-1 font-bold text-white ${
                previous ? "bg-[#64748b]" : "bg-[#b45309]"
              }`}
            >
              {previous ? versionByKey.get(memo.versionKey)?.label ?? "이전" : numberOf.get(memo.id)}
            </span>
            <span className="font-bold text-[#334155]">p.{memo.page}</span>
            {previous && changedPages.has(memo.page) ? (
              <span className="rounded-[3px] bg-[#fef3c7] px-1.5 font-semibold text-[#92400e]">이번 버전에서 변경된 페이지</span>
            ) : null}
            <span className="ml-auto text-[#94a3b8]">{shortDateTime(memo.updatedAt ?? memo.createdAt)}</span>
          </span>
          <span className="mt-1 block text-[11px] font-semibold text-[#64748b]">
            {memo.authorName}
            {mine ? " (나)" : ""}
          </span>
        </div>
        {editing ? (
          <div className="mt-2">
            <textarea
              autoFocus
              className="h-24 w-full resize-y rounded-[4px] border border-[#cbd5e1] p-2 text-sm leading-5 outline-none focus:border-[#b45309]"
              onChange={(event) => setEditText(event.target.value)}
              value={editText}
            />
            <div className="mt-1.5 flex justify-end gap-1.5">
              <button className="h-7 rounded-[4px] px-2.5 text-xs font-bold text-[#64748b] hover:bg-[#f1f5f9]" onClick={() => setEditingId(null)} type="button">
                취소
              </button>
              <button
                className="h-7 rounded-[4px] bg-[#b45309] px-3 text-xs font-bold text-white disabled:opacity-50"
                disabled={!editText.trim()}
                onClick={() => void saveEdit(memo)}
                type="button"
              >
                저장
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-1.5 whitespace-pre-wrap text-sm leading-5 text-[#1e293b]">{memo.text}</p>
        )}
        {!previous && !editing && canEdit(memo) && !memo.id.startsWith("pending-") ? (
          <div className="mt-2 flex justify-end gap-1 text-[11px]" onMouseDown={(event) => event.stopPropagation()}>
            <button
              className="rounded-[3px] px-2 py-0.5 font-semibold text-[#64748b] hover:bg-[#f1f5f9]"
              onClick={() => {
                setEditingId(memo.id);
                setEditText(memo.text);
              }}
              type="button"
            >
              수정
            </button>
            <button className="rounded-[3px] px-2 py-0.5 font-semibold text-[#b91c1c] hover:bg-[#fef2f2]" onClick={() => void remove(memo)} type="button">
              삭제
            </button>
          </div>
        ) : null}
      </li>
    );
  };

  // 입력창은 draft가 같으면 그대로 유지 — 저장 함수는 ref로 최신 것을 호출
  const saveDraftRef = useRef(saveDraft);
  useEffect(() => {
    saveDraftRef.current = saveDraft;
  });
  const draftPopover = useMemo(
    () =>
      draft ? (
        <DraftPopover
          key={`${draft.x},${draft.y}`}
          onCancel={() => setDraft(null)}
          onSave={(text) => void saveDraftRef.current(text)}
        />
      ) : null,
    [draft],
  );

  const hasFile = Boolean(activeVersion?.reviewId && activeVersion.fileId);

  return (
    <WorkspaceSectionCard id="expert-review" title="사전심의: 전문가 분석" bare>
      <div className="mb-4 rounded-md border border-[#d7dee8] bg-white p-4">
        <p className="mb-3 text-sm font-bold text-[#15345b]">도서 버전</p>
        {versionPicker ?? <p className="text-xs text-[#94a3b8]">AI 분석 탭에서 PDF를 업로드하면 도서 버전이 만들어집니다.</p>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        {/* 왼쪽: 메모 목록 */}
        <div className="flex min-h-0 flex-col rounded-md border border-[#d7dee8] bg-white p-4 xl:max-h-[calc(78vh+49px)]">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-[#15345b]">전문가 메모</p>
            <span className="text-xs text-[#94a3b8]">{versionMemos.length}건</span>
          </div>
          <div className="mt-3 flex gap-1 border-b border-[#e2e8f0] text-xs">
            {(
              [
                ["all", `전체 ${versionMemos.length}`],
                ["page", `현재 페이지 ${versionMemos.filter((memo) => memo.page === page).length}`],
              ] as const
            ).map(([id, label]) => (
              <button
                className={`-mb-px rounded-t-[4px] border px-3 py-1.5 font-bold ${
                  listTab === id ? "border-[#e2e8f0] border-b-white bg-white text-[#15345b]" : "border-transparent text-[#94a3b8] hover:text-[#475569]"
                }`}
                key={id}
                onClick={() => setListTab(id)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-3 min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {listed.length === 0 ? (
              <p className="rounded-[4px] border border-dashed border-[#d0d5dd] bg-[#f8fafc] px-3 py-6 text-center text-xs leading-5 text-[#94a3b8]">
                {listTab === "page" ? "이 페이지에는 메모가 없습니다." : "아직 메모가 없습니다."}
                <br />
                ‘영역 표시’로 도서 위에 네모를 그리면 메모를 남길 수 있습니다.
              </p>
            ) : (
              <ul className="space-y-2">{listed.map((memo) => memoCard(memo, false))}</ul>
            )}

            {previousMemos.length > 0 ? (
              <div>
                <button
                  className="flex w-full items-center justify-between border-t border-[#e2e8f0] pt-3 text-xs font-bold text-[#475569]"
                  onClick={() => setShowPrevious((value) => !value)}
                  type="button"
                >
                  이전 버전 의견 {previousMemos.length}건
                  <span className="text-[#94a3b8]">{showPrevious ? "접기 ▲" : "펼치기 ▼"}</span>
                </button>
                {showPrevious ? (
                  <>
                    <p className="mt-1.5 text-[11px] leading-4 text-[#94a3b8]">
                      이전 제출본에 남긴 의견입니다. 누르면 같은 페이지 번호에 점선으로 위치를 보여 줍니다.
                    </p>
                    <ul className="mt-2 space-y-2">{previousMemos.map((memo) => memoCard(memo, true))}</ul>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* 오른쪽: PDF 뷰어 */}
        <div className="min-w-0 rounded-md border border-[#d7dee8] bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-[#e2e8f0] px-3 py-2">
            <div className="flex items-center gap-1" role="toolbar" aria-label="표시 도구">
              {TOOLS.map((item) => (
                <button
                  className={`flex h-8 items-center gap-1.5 rounded-[4px] border px-2.5 text-xs font-bold ${
                    tool === item.id ? "border-[#b45309] bg-[#fff8ed] text-[#b45309]" : "border-transparent text-[#475569] hover:bg-[#f1f5f9]"
                  }`}
                  key={item.id}
                  onClick={() => {
                    setTool(item.id);
                    setDraft(null);
                  }}
                  title={item.hint}
                  type="button"
                >
                  <span aria-hidden>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
            <span className="mx-1 h-5 w-px bg-[#e2e8f0]" />
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
              {changedPages.has(page) ? (
                <span className="ml-1 rounded-[3px] bg-[#fef3c7] px-1.5 py-0.5 text-[11px] font-semibold text-[#92400e]">이전 버전 대비 변경</span>
              ) : null}
            </div>
            <div className="ml-auto flex items-center gap-1 text-xs text-[#475569]">
              <button className="h-8 w-8 rounded-[4px] hover:bg-[#f1f5f9]" onClick={() => setZoom((value) => nextZoom(value, -1))} title="축소" type="button">
                −
              </button>
              <button className="min-w-[52px] rounded-[4px] py-1 text-center font-semibold hover:bg-[#f1f5f9]" onClick={() => setZoom(1)} title="화면 폭에 맞춤" type="button">
                {zoom === 1 ? "폭 맞춤" : `${Math.round(zoom * 100)}%`}
              </button>
              <button className="h-8 w-8 rounded-[4px] hover:bg-[#f1f5f9]" onClick={() => setZoom((value) => nextZoom(value, 1))} title="확대" type="button">
                +
              </button>
            </div>
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
                <div className="h-full bg-[#b45309] transition-all" style={{ width: `${Math.max(4, pdf.progress * 100)}%` }} />
              </div>
            </div>
          ) : (
            <ExpertPdfViewer
              boxes={boxes}
              doc={pdf.doc}
              draftPopover={draftPopover}
              draftRegion={draft}
              onDraftComplete={onDraftComplete}
              onPageCount={setPageCount}
              onSelectBox={onSelectBox}
              focus={focus}
              prefetchPages={memoPages}
              page={page}
              tool={tool}
              zoom={zoom}
            />
          )}

          <div className="flex items-center gap-3 border-t border-[#e2e8f0] px-3 py-2 text-[11px] text-[#94a3b8]">
            <span>{TOOLS.find((item) => item.id === tool)?.hint}</span>
            {message ? <span className="font-semibold text-[#b91c1c]">{message}</span> : null}
            <span className="ml-auto">메모는 저장 즉시 모든 검토자에게 공유됩니다</span>
          </div>
        </div>
      </div>
    </WorkspaceSectionCard>
  );
}

/** 메모 입력창 — 글자 입력이 상위(뷰어·목록)를 다시 그리지 않도록 자체 상태로 */
function DraftPopover({ onSave, onCancel }: { onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  return (
    <div className="rounded-md border border-[#b45309] bg-white p-2.5 shadow-lg">
      <textarea
        autoFocus
        className="h-24 w-full resize-y rounded-[4px] border border-[#cbd5e1] p-2 text-sm leading-5 outline-none focus:border-[#b45309]"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && text.trim()) onSave(text);
          if (event.key === "Escape") onCancel();
        }}
        placeholder="이 영역에 대한 의견을 적어 주세요"
        value={text}
      />
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[10px] text-[#94a3b8]">⌘/Ctrl + Enter 저장</span>
        <span className="flex gap-1.5">
          <button className="h-7 rounded-[4px] px-2.5 text-xs font-bold text-[#64748b] hover:bg-[#f1f5f9]" onClick={onCancel} type="button">
            취소
          </button>
          <button
            className="h-7 rounded-[4px] bg-[#b45309] px-3 text-xs font-bold text-white disabled:opacity-50"
            disabled={!text.trim()}
            onClick={() => onSave(text)}
            type="button"
          >
            메모 저장
          </button>
        </span>
      </div>
    </div>
  );
}
