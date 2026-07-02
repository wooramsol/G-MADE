import { timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { getPrismaClient, isDatabaseAvailable } from "./prisma";
import type { RoleCode } from "./types";

function secureCompare(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: RoleCode;
};

function getEnvAdminCredentials(): AuthenticatedUser | null {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD?.trim();

  if (!email || !password) return null;

  return {
    id: "env-admin",
    email,
    name: "시스템 관리자",
    role: "ADMIN",
  };
}

function matchesEnvAdmin(email: string, password: string): AuthenticatedUser | null {
  const admin = getEnvAdminCredentials();
  const expectedPassword = process.env.ADMIN_PASSWORD?.trim();
  if (!admin || !expectedPassword) return null;
  if (email.toLowerCase() !== admin.email) return null;
  if (!secureCompare(password, expectedPassword)) return null;
  return admin;
}

async function authenticateWithDatabase(email: string, password: string): Promise<AuthenticatedUser | null> {
  const prisma = getPrismaClient();
  if (!prisma) return null;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { role: true },
  });

  if (!user?.active || !user.passwordHash) return null;

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatches) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.code as RoleCode,
  };
}

export async function authenticateUser(email: string, password: string): Promise<AuthenticatedUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedPassword = password.trim();

  if (!normalizedEmail || !normalizedPassword) return null;

  const envAdmin = matchesEnvAdmin(normalizedEmail, normalizedPassword);
  if (envAdmin) return envAdmin;

  if (!(await isDatabaseAvailable())) return null;

  try {
    return await authenticateWithDatabase(normalizedEmail, normalizedPassword);
  } catch {
    return matchesEnvAdmin(normalizedEmail, normalizedPassword);
  }
}
