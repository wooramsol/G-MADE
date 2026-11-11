"use client";

import Link from "next/link";
import { useEffect } from "react";

/** 예상하지 못한 오류 화면 — 영어 기본 화면 대신 안내와 다시 시도 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[page-error]", error);
  }, [error]);

  return (
    <main className="min-h-[60vh] bg-[#f4f7fb] px-6 py-16 text-[#172033]">
      <div className="mx-auto max-w-[560px] rounded-md border border-[#d7dee8] bg-white p-8 text-center panel-shadow">
        <p className="text-lg font-bold text-[#15345b]">화면을 불러오는 중 문제가 생겼습니다</p>
        <p className="mt-2 text-sm leading-6 text-[#475569]">
          잠시 후 다시 시도해 주세요. 같은 문제가 계속되면 관리자에게 아래 오류 번호를 알려 주세요.
        </p>
        {error.digest ? <p className="mt-2 text-xs text-[#94a3b8]">오류 번호: {error.digest}</p> : null}
        <div className="mt-6 flex justify-center gap-2">
          <button className="primary-action-blue rounded-md px-4 py-2 text-sm font-bold" onClick={() => reset()} type="button">
            다시 시도
          </button>
          <Link className="rounded-md border border-[#d7dee8] bg-white px-4 py-2 text-sm font-bold text-[#15345b]" href="/projects">
            목록으로
          </Link>
        </div>
      </div>
    </main>
  );
}
