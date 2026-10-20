"use client";

import { useActionState } from "react";
import { createOfficerAction, deleteApplicantAction, resetPasswordAction, type AccountActionState } from "./actions";

const inputClass =
  "w-full rounded-md border border-[#d7dee8] bg-[#f8fafc] px-3 py-2 text-sm outline-none focus:border-[#2463b3] focus:bg-white";

export function CreateOfficerForm() {
  const [state, action, pending] = useActionState<AccountActionState, FormData>(createOfficerAction, {});
  return (
    <form action={action} className="grid gap-3 md:grid-cols-[1fr_1.3fr_1fr_1fr_auto] md:items-end">
      <label className="text-xs font-bold text-[#475569]">
        이름·부서
        <input className={`${inputClass} mt-1`} name="name" placeholder="예: 홍길동 (경관디자인과)" required />
      </label>
      <label className="text-xs font-bold text-[#475569]">
        이메일 (로그인 아이디)
        <input className={`${inputClass} mt-1`} name="email" required type="email" />
      </label>
      <label className="text-xs font-bold text-[#475569]">
        휴대폰 (선택)
        <input className={`${inputClass} mt-1`} inputMode="tel" name="phone" placeholder="010-1234-5678" />
      </label>
      <label className="text-xs font-bold text-[#475569]">
        임시 비밀번호
        <input className={`${inputClass} mt-1`} name="password" placeholder="영문·숫자 8자 이상" required />
      </label>
      <button className="primary-action-blue h-[38px] rounded-md px-4 text-sm font-bold disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "발급 중…" : "공무원 계정 발급"}
      </button>
      {state.error ? <p className="text-sm font-semibold text-red-700 md:col-span-5">{state.error}</p> : null}
      {state.ok ? <p className="text-sm font-semibold text-[#047857] md:col-span-5">{state.ok}</p> : null}
    </form>
  );
}

export function ResetPasswordForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<AccountActionState, FormData>(resetPasswordAction, {});
  return (
    <form action={action} className="flex items-center gap-1.5">
      <input name="id" type="hidden" value={id} />
      <input className="w-36 rounded-md border border-[#d7dee8] px-2 py-1 text-xs" name="password" placeholder="새 비밀번호" required />
      <button className="rounded-md border border-[#d7dee8] px-2 py-1 text-xs font-bold text-[#475569] hover:bg-[#f1f5f9]" disabled={pending} type="submit">
        재설정
      </button>
      {state.error ? <span className="text-[11px] text-red-700">{state.error}</span> : null}
      {state.ok ? <span className="text-[11px] text-[#047857]">{state.ok}</span> : null}
    </form>
  );
}

/** 지원자 계정 삭제 — 확인 후 등록한 사업·접수 기록까지 함께 삭제 */
export function DeleteApplicantButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteApplicantAction}
      onSubmit={(event) => {
        if (!window.confirm(`${name} 지원자 계정을 삭제할까요?\n이 지원자가 등록한 사업과 접수 기록·업로드 도서도 함께 영구 삭제되며 되돌릴 수 없습니다.`)) {
          event.preventDefault();
        }
      }}
    >
      <input name="id" type="hidden" value={id} />
      <button className="rounded-md border border-[#fecaca] px-2 py-1 text-xs font-bold text-[#b91c1c] hover:bg-[#fef2f2]" type="submit">
        계정 삭제
      </button>
    </form>
  );
}
