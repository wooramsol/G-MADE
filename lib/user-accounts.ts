import bcrypt from "bcryptjs";
import { getPrismaClient, isDatabaseAvailable } from "./prisma";
import type { RoleCode } from "./types";

/**
 * 계정 관리 — 지원자 회원가입, 관리자의 공무원 계정 발급·사용 중지.
 * 계정은 DB(users 테이블)에 저장되며 DB가 없으면 사용할 수 없다.
 */

const ROLE_META: Record<Exclude<RoleCode, "REVIEWER">, { name: string; description: string }> = {
  ADMIN: { name: "관리자", description: "계정 발급·전체 관리" },
  OFFICER: { name: "공무원", description: "도서 접수 확인, 사전심의(AI 분석·판정), 본심의 진행" },
  APPLICANT: { name: "지원자", description: "사업 등록과 도서 접수·보완 제출" },
};

export type AccountSummary = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  role: RoleCode;
  active: boolean;
  createdAt: string;
};

async function ensureRole(code: Exclude<RoleCode, "REVIEWER">) {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("계정 저장소(DB)를 사용할 수 없습니다.");
  return prisma.role.upsert({
    where: { code },
    update: {},
    create: { code, ...ROLE_META[code] },
  });
}

/** 휴대폰 번호 — 숫자만 남겨 010xxxxxxxx(10~11자리) 확인 */
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return /^01[016789]\d{7,8}$/.test(digits) ? digits : null;
}

export function formatPhone(digits: string | null | undefined): string {
  if (!digits) return "";
  return digits.length === 11 ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}` : `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "비밀번호에 영문과 숫자를 함께 넣어 주세요.";
  return null;
}

export async function createAccount(input: {
  email: string;
  name: string;
  password: string;
  phone?: string;
  role: "OFFICER" | "APPLICANT";
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!(await isDatabaseAvailable())) return { ok: false, error: "계정 저장소(DB)에 연결할 수 없습니다." };
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false, error: "계정 저장소(DB)에 연결할 수 없습니다." };

  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "이메일 형식이 올바르지 않습니다." };
  if (!name) return { ok: false, error: "이름을 입력해 주세요." };
  const phoneInput = (input.phone ?? "").trim();
  const phone = phoneInput ? normalizePhone(phoneInput) : null;
  if (phoneInput && !phone) return { ok: false, error: "휴대폰 번호를 확인해 주세요. (예: 010-1234-5678)" };
  if (input.role === "APPLICANT" && !phone) return { ok: false, error: "휴대폰 번호를 입력해 주세요." };
  const passwordError = validatePassword(input.password);
  if (passwordError) return { ok: false, error: passwordError };
  if (email === process.env.ADMIN_EMAIL?.trim().toLowerCase()) return { ok: false, error: "이미 사용 중인 이메일입니다." };

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { ok: false, error: "이미 가입된 이메일입니다." };

  const role = await ensureRole(input.role);
  const user = await prisma.user.create({
    data: {
      email,
      name: name.slice(0, 60),
      phone,
      passwordHash: await bcrypt.hash(input.password, 12),
      roleId: role.id,
      active: true,
    },
  });
  return { ok: true, id: user.id };
}

export async function listAccounts(): Promise<AccountSummary[]> {
  const prisma = getPrismaClient();
  if (!prisma || !(await isDatabaseAvailable())) return [];
  const users = await prisma.user.findMany({ include: { role: true }, orderBy: { createdAt: "desc" } });
  type Row = { id: string; email: string; name: string; phone: string | null; active: boolean; createdAt: Date; role: { code: string } };
  return (users as Row[]).map((user) => ({
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role.code as RoleCode,
    active: user.active,
    createdAt: user.createdAt.toISOString(),
  }));
}

export async function setAccountActive(id: string, active: boolean): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) throw new Error("계정 저장소(DB)를 사용할 수 없습니다.");
  await prisma.user.update({ where: { id }, data: { active } });
}

export async function resetAccountPassword(id: string, password: string): Promise<string | null> {
  const passwordError = validatePassword(password);
  if (passwordError) return passwordError;
  const prisma = getPrismaClient();
  if (!prisma) return "계정 저장소(DB)를 사용할 수 없습니다.";
  await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  return null;
}

/**
 * 지원자 계정 삭제 — 그 지원자가 등록한 사업(접수 기록·업로드 파일 포함)도 함께 영구 삭제.
 * 관리자 화면에서만 호출. 공무원·관리자 계정은 삭제하지 않음(사용 중지만).
 */
export async function deleteApplicantAccount(id: string): Promise<{ ok: true; projects: number } | { ok: false; error: string }> {
  const prisma = getPrismaClient();
  if (!prisma) return { ok: false, error: "계정 저장소(DB)를 사용할 수 없습니다." };
  const user = await prisma.user.findUnique({ where: { id }, include: { role: true } });
  if (!user) return { ok: false, error: "계정을 찾을 수 없습니다." };
  if (user.role.code !== "APPLICANT") return { ok: false, error: "지원자 계정만 삭제할 수 있습니다. 공무원 계정은 사용 중지하세요." };

  const { getAllProjects, getTrashedProjects, purgeProjectRecord } = await import("./project-store");
  const { collectProjectStoredFiles } = await import("./project-file-pool");
  const { deleteSavedUploadFiles, storedRefsToSavedFiles } = await import("./save-uploaded-files");
  const owned = [...(await getAllProjects()), ...(await getTrashedProjects())].filter((project) => project.ownerId === id);
  for (const project of owned) {
    await purgeProjectRecord(project.id);
    await deleteSavedUploadFiles(storedRefsToSavedFiles(collectProjectStoredFiles(project))).catch(() => undefined);
  }
  await prisma.user.delete({ where: { id } });
  return { ok: true, projects: owned.length };
}
