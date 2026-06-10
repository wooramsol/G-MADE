"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { authenticateUser } from "@/lib/auth-credentials";
import { recordLoginHistory } from "@/lib/login-history";
import { getClientIp } from "@/lib/request-ip";

export type LoginState = {
  error?: string;
};

export async function loginAction(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/");

  const user = await authenticateUser(email, password);
  if (!user) {
    return { error: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  const headerList = await headers();
  await recordLoginHistory({
    userId: user.id,
    email: user.email,
    ipAddress: getClientIp(headerList),
    status: "SUCCESS",
  });

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: callbackUrl.startsWith("/") ? callbackUrl : "/",
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
