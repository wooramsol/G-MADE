"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { createAccount, resetAccountPassword, setAccountActive } from "@/lib/user-accounts";

export type AccountActionState = { error?: string; ok?: string };

async function requireAdmin() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") throw new Error("관리자만 사용할 수 있습니다.");
}

/** 공무원 계정 발급 */
export async function createOfficerAction(_previous: AccountActionState, formData: FormData): Promise<AccountActionState> {
  await requireAdmin();
  const result = await createAccount({
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    role: "OFFICER",
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/users");
  return { ok: "공무원 계정을 발급했습니다. 이메일과 임시 비밀번호를 담당자에게 전달하세요." };
}

export async function toggleAccountAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await setAccountActive(String(formData.get("id") ?? ""), formData.get("active") === "1");
  revalidatePath("/admin/users");
}

export async function resetPasswordAction(_previous: AccountActionState, formData: FormData): Promise<AccountActionState> {
  await requireAdmin();
  const error = await resetAccountPassword(String(formData.get("id") ?? ""), String(formData.get("password") ?? ""));
  if (error) return { error };
  return { ok: "비밀번호를 변경했습니다." };
}
