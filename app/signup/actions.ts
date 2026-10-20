"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { createAccount } from "@/lib/user-accounts";

export type SignupState = { error?: string };

/** 지원자 회원가입 — 가입 후 로그인 화면으로 */
export async function signupAction(_previous: SignupState, formData: FormData): Promise<SignupState> {
  const name = String(formData.get("name") ?? "");
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("passwordConfirm") ?? "");
  const agreed = formData.get("agree") === "on";

  const ip = getClientIp(await headers());
  const rate = checkRateLimit(`signup:${ip}`, 5, 10 * 60_000);
  if (!rate.allowed) return { error: `가입 시도가 너무 많습니다. ${rate.retryAfterSeconds}초 후 다시 시도해 주세요.` };

  if (password !== passwordConfirm) return { error: "비밀번호 확인이 일치하지 않습니다." };
  if (!agreed) return { error: "개인정보 수집·이용에 동의해 주세요." };

  const result = await createAccount({ name, email, password, role: "APPLICANT" });
  if (!result.ok) return { error: result.error };

  redirect("/login?signedUp=1");
}
