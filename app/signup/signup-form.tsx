"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Caption, ErrorText, FormLabel } from "@/components/typography";
import { signupAction, type SignupState } from "./actions";

const initialState: SignupState = {};
const inputClass =
  "mt-2 w-full rounded-md border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#2463b3] focus:bg-white";

export default function SignupForm() {
  const [state, formAction, pending] = useActionState(signupAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <label className="block">
        <FormLabel>이름 (담당자명 또는 업체명)</FormLabel>
        <input autoComplete="name" className={inputClass} maxLength={60} name="name" required />
      </label>
      <label className="block">
        <FormLabel>이메일</FormLabel>
        <input autoComplete="email" className={inputClass} name="email" required type="email" />
      </label>
      <label className="block">
        <FormLabel>비밀번호</FormLabel>
        <input autoComplete="new-password" className={inputClass} minLength={8} name="password" placeholder="영문·숫자 포함 8자 이상" required type="password" />
      </label>
      <label className="block">
        <FormLabel>비밀번호 확인</FormLabel>
        <input autoComplete="new-password" className={inputClass} minLength={8} name="passwordConfirm" required type="password" />
      </label>
      <label className="flex items-start gap-2 text-sm text-[#334155]">
        <input className="mt-1" name="agree" type="checkbox" />
        <span>
          심의 신청 처리를 위해 이름·이메일을 수집·이용하는 데 동의합니다.{" "}
          <Link className="font-semibold !text-[#2463b3] underline" href="/data-processing" target="_blank">
            자세히
          </Link>
        </span>
      </label>
      {state.error ? <ErrorText className="rounded-md bg-red-50 px-4 py-3">{state.error}</ErrorText> : null}
      <button
        className="primary-action-blue w-full rounded-md px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-70"
        disabled={pending}
        type="submit"
      >
        {pending ? "가입 중..." : "지원자 회원가입"}
      </button>
      <Caption className="text-center">
        이미 계정이 있으신가요?{" "}
        <Link className="font-semibold !text-[#2463b3] underline" href="/login">
          로그인
        </Link>
      </Caption>
    </form>
  );
}
