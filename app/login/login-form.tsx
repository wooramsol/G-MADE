"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

type LoginFormProps = {
  callbackUrl: string;
};

export default function LoginForm({ callbackUrl }: LoginFormProps) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input name="callbackUrl" type="hidden" value={callbackUrl} />
      <label className="block">
        <span className="text-sm font-bold text-[#15345b]">이메일</span>
        <input
          autoComplete="email"
          className="mt-2 w-full rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#2463b3] focus:bg-white"
          defaultValue="admin@gmadehive.com"
          name="email"
          placeholder="admin@gmadehive.com"
          required
          type="email"
        />
      </label>
      <label className="block">
        <span className="text-sm font-bold text-[#15345b]">비밀번호</span>
        <input
          autoComplete="current-password"
          className="mt-2 w-full rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#2463b3] focus:bg-white"
          name="password"
          placeholder="비밀번호를 입력하세요"
          required
          type="password"
        />
      </label>
      {state.error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{state.error}</p>
      ) : null}
      <button
        className="primary-action-blue w-full rounded-xl px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-70"
        disabled={pending}
        type="submit"
      >
        {pending ? "로그인 중..." : "로그인"}
      </button>
      <p className="text-center text-xs leading-5 text-[#64748b]">
        내부 테스트용 계정입니다. 이메일 인증이나 비밀번호 재설정 메일은 발송되지 않습니다.
      </p>
    </form>
  );
}
