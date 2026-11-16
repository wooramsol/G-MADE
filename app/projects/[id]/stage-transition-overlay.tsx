"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

/**
 * 단계 전환(다음 단계로 넘기기·되돌리기·종료·철회) 중 화면 전체를 막는 로딩창.
 * 서버 처리와 화면 갱신이 끝날 때까지 다른 조작(중복 클릭, 다른 단계 열기, 분석 시작 등)을 막는다.
 */
let currentLabel: string | null = null;
let settleTimer: number | null = null;
const listeners = new Set<() => void>();

function setLabel(next: string | null) {
  if (settleTimer !== null) {
    window.clearTimeout(settleTimer);
    settleTimer = null;
  }
  currentLabel = next;
  listeners.forEach((listener) => listener());
}

/** 화면 갱신이 늦거나 오지 않아도 로딩창이 남지 않게 하는 한도 */
const SETTLE_TIMEOUT_MS = 10_000;

/**
 * 단계 전환 작업을 로딩창과 함께 실행한다. task가 true(성공)를 돌려주면 새 단계 화면이 그려질 때까지
 * (프로젝트 데이터가 바뀔 때까지) 로딩창을 유지하고, false(실패·취소)면 바로 닫는다.
 */
export async function runStageTransition(label: string, task: () => Promise<boolean>): Promise<boolean> {
  setLabel(label);
  let ok = false;
  try {
    ok = await task();
  } finally {
    if (ok) settleTimer = window.setTimeout(() => setLabel(null), SETTLE_TIMEOUT_MS);
    else setLabel(null);
  }
  return ok;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** settleKey — 프로젝트 데이터가 바뀌면 달라지는 값. 바뀌면 전환이 화면에 반영된 것이므로 로딩창을 닫는다 */
export default function StageTransitionOverlay({ settleKey }: { settleKey: string }) {
  const label = useSyncExternalStore(
    subscribe,
    () => currentLabel,
    () => null,
  );
  useEffect(() => {
    // 전환이 끝나 새 데이터가 도착함 (진행 중인 요청의 로딩창은 건드리지 않음 — 완료 대기 중일 때만 닫는다)
    if (settleTimer !== null) setLabel(null);
  }, [settleKey]);
  useEffect(() => () => setLabel(null), []);
  return label ? <BlockingNotice label={label} /> : null;
}

/** 화면 전체를 덮는 처리 중 안내 (도서 제출처럼 진행률 문구가 바뀌는 작업에도 사용) */
export function BlockingNotice({ label }: { label: string }) {
  useBodyScrollLock(true);
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="fixed inset-0 z-[3000] flex cursor-wait items-center justify-center bg-[#172033]/50 p-4"
      role="alertdialog"
    >
      <div className="flex w-full max-w-sm items-center gap-4 rounded-md border border-[#d7dee8] bg-white p-6 shadow-xl">
        <div aria-hidden="true" className="h-10 w-10 shrink-0 animate-spin rounded-full border-4 border-[#e2e8f0] border-t-[#2463b3]" />
        <div className="min-w-0">
          <p className="text-base font-bold text-[#15345b]">{label}</p>
          <p className="mt-1 text-sm text-[#64748b]">끝날 때까지 잠시 기다려 주세요.</p>
        </div>
      </div>
    </div>
  );
}
