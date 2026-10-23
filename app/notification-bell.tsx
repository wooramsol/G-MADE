"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Item = { id: string; kind: string; title: string; body: string | null; link: string | null; createdAt: string; read: boolean };

const KIND_STYLE: Record<string, { label: string; className: string }> = {
  NEW_SUBMISSION: { label: "신규 접수", className: "bg-[#e8f1ff] text-[#2463b3]" },
  RESUBMISSION: { label: "보완 제출", className: "bg-[#e8f1ff] text-[#2463b3]" },
  SCREENING: { label: "사전검토", className: "bg-[#eef4fb] text-[#15345b]" },
  PRE_REVIEW: { label: "사전심의", className: "bg-[#eef4fb] text-[#15345b]" },
  PRE_REVIEW_DONE: { label: "수정 도서 요청", className: "bg-[#fff8ed] text-[#b45309]" },
  MAIN_SUBMISSION: { label: "수정 도서 제출", className: "bg-[#e8f1ff] text-[#2463b3]" },
  REVISION_REQUESTED: { label: "보완 요청", className: "bg-[#fff8ed] text-[#b45309]" },
  MAIN_REVIEW: { label: "본심의", className: "bg-[#ecfdf5] text-[#047857]" },
  CLOSED: { label: "심의종료", className: "bg-[#f1f5f9] text-[#15345b]" },
  WITHDRAWN: { label: "신청 철회", className: "bg-[#f1f5f9] text-[#475569]" },
  REJECTED: { label: "반려", className: "bg-[#fef2f2] text-[#b91c1c]" },
};

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.round(hours / 24)}일 전`;
}

/** 상단 알림 — 종 아이콘 + 안 읽은 개수 배지, 누르면 목록 */
export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { unread: number; items: Item[] };
      setUnread(payload.unread);
      setItems(payload.items);
    } catch {
      // 네트워크 오류 시 이전 값 유지
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!boxRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const markRead = async (body: { ids?: string[]; all?: boolean }) => {
    const response = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    if (response?.ok) {
      const payload = (await response.json()) as { unread: number; items: Item[] };
      setUnread(payload.unread);
      setItems(payload.items);
    }
  };

  return (
    <div className="relative" ref={boxRef}>
      <button
        aria-label={`알림 ${unread}건`}
        className="relative flex h-10 w-10 items-center justify-center rounded-lg text-[#15345b] transition hover:bg-[#e8f1ff]"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) void load();
        }}
        type="button"
      >
        <svg aria-hidden fill="none" height="22" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="22">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#dc2626] px-1 text-[11px] font-bold leading-none text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-[2000] w-[360px] overflow-hidden rounded-lg border border-[#d7dee8] bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-[#e2e8f0] px-4 py-3">
            <p className="text-sm font-bold text-[#15345b]">알림 {unread > 0 ? <span className="text-[#dc2626]">{unread}</span> : null}</p>
            {unread > 0 ? (
              <button className="text-xs font-semibold text-[#2463b3] hover:underline" onClick={() => void markRead({ all: true })} type="button">
                모두 읽음
              </button>
            ) : null}
          </div>
          <ul className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? <li className="px-4 py-8 text-center text-sm text-[#94a3b8]">새 알림이 없습니다.</li> : null}
            {items.map((item) => {
              const style = KIND_STYLE[item.kind] ?? { label: "알림", className: "bg-[#f1f5f9] text-[#475569]" };
              return (
                <li key={item.id}>
                  <button
                    className={`block w-full border-b border-[#f1f5f9] px-4 py-3 text-left transition hover:bg-[#f8fafc] ${item.read ? "opacity-60" : ""}`}
                    onClick={() => {
                      if (!item.read) void markRead({ ids: [item.id] });
                      setOpen(false);
                      if (item.link) router.push(item.link as never);
                    }}
                    type="button"
                  >
                    <span className="flex items-center gap-2">
                      <span className={`rounded-[3px] px-1.5 py-0.5 text-[10px] font-bold ${style.className}`}>{style.label}</span>
                      {!item.read ? <span className="h-2 w-2 rounded-full bg-[#dc2626]" /> : null}
                      <span className="ml-auto text-[11px] text-[#94a3b8]">{timeAgo(item.createdAt)}</span>
                    </span>
                    <span className="mt-1 block text-sm font-semibold leading-5 text-[#172033]">{item.title}</span>
                    {item.body ? <span className="mt-0.5 line-clamp-2 block text-xs leading-4 text-[#64748b]">{item.body}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
