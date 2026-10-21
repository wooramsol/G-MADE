import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { authenticateUser } from "@/lib/auth-credentials";
import type { RoleCode } from "@/lib/types";

function toRoleCode(value: unknown): RoleCode {
  if (value === "ADMIN" || value === "REVIEWER" || value === "OFFICER" || value === "APPLICANT") {
    return value;
  }
  // 알 수 없는 역할은 가장 낮은 권한으로
  return "APPLICANT";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "이메일", type: "email" },
        password: { label: "비밀번호", type: "password" },
      },
      authorize: async (credentials) => {
        const email = typeof credentials?.email === "string" ? credentials.email : "";
        const password = typeof credentials?.password === "string" ? credentials.password : "";
        return authenticateUser(email, password);
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id ?? token.id;
        token.role = user.role ?? token.role;
        token.checkedAt = Date.now();
        return token;
      }
      // 사용 중지된 계정·변경된 역할을 5분마다 반영 (로그인 상태가 7일 유지되므로)
      const checkedAt = typeof token.checkedAt === "number" ? token.checkedAt : 0;
      if (typeof token.id === "string" && token.id !== "env-admin" && Date.now() - checkedAt > 5 * 60_000) {
        try {
          const { getPrismaClient } = await import("@/lib/prisma");
          const prisma = getPrismaClient();
          if (prisma) {
            const record = await prisma.user.findUnique({ where: { id: token.id }, include: { role: true } });
            if (!record || !record.active) return null;
            token.role = record.role.code;
          }
          token.checkedAt = Date.now();
        } catch {
          // DB 오류 시 기존 로그인 유지
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : "";
        session.user.role = toRoleCode(token.role);
      }
      return session;
    },
  },
});
