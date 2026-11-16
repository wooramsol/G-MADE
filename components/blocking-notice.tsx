"use client";

import { useFormStatus } from "react-dom";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

/**
 * 화면 전체를 덮는 '처리 중' 로딩창 — 처리가 끝날 때까지 다른 조작(중복 클릭 등)을 막는다.
 * 저장·생성·삭제·단계 전환처럼 서버 처리를 기다려야 하는 곳에서 공통으로 쓴다.
 */
export function BlockingNotice({ label }: { label: string }) {
  useBodyScrollLock(true);
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="fixed inset-0 z-[3000] flex cursor-wait items-center justify-center bg-[#172033]/50 p-4"
      role="alertdialog"
    >
      <div className="flex w-full max-w-sm items-center gap-4 rounded-md border border-[#d7dee8] bg-white p-6 text-left shadow-xl">
        <div aria-hidden="true" className="h-10 w-10 shrink-0 animate-spin rounded-full border-4 border-[#e2e8f0] border-t-[#2463b3]" />
        <div className="min-w-0">
          <p className="text-base font-bold text-[#15345b]">{label}</p>
          <p className="mt-1 text-sm font-normal text-[#64748b]">끝날 때까지 잠시 기다려 주세요.</p>
        </div>
      </div>
    </div>
  );
}

/** 폼(서버 액션) 안에 넣으면 제출 처리 중에만 로딩창을 띄운다 */
export function FormPendingNotice({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return pending ? <BlockingNotice label={label} /> : null;
}
