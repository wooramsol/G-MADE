"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { authenticateUser } from "@/lib/auth-credentials";
import { recordLoginHistory } from "@/lib/login-history";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { sanitizeCallbackUrl } from "@/lib/safe-callback-url";

export type LoginState = {
  error?: string;
};

export async function loginAction(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const callbackUrl = sanitizeCallbackUrl(formData.get("callbackUrl"));

  const headerList = await headers();
  const clientIp = getClientIp(headerList);

  const rate = checkRateLimit(`login:${clientIp}`, RATE_LIMITS.login.limit, RATE_LIMITS.login.windowMs);
  if (!rate.allowed) {
    return { error: `로그인 시도가 너무 많습니다. ${rate.retryAfterSeconds}초 후 다시 시도해 주세요.` };
  }

  const user = await authenticateUser(email, password);
  if (!user) {
    await recordLoginHistory({
      userId: null,
      email: email.trim().toLowerCase(),
      ipAddress: clientIp,
      status: "FAILED",
    });
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  await recordLoginHistory({
    userId: user.id,
    email: user.email,
    ipAddress: clientIp,
    status: "SUCCESS",
  });

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: callbackUrl,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.type === "CredentialsSignin") {
        return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
      }
      return { error: "로그인에 실패했습니다." };
    }
    throw error;
  }

  return {};
}
