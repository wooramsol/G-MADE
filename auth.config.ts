import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 7,
  },
  providers: [],
  trustHost: true,
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const pathname = nextUrl.pathname;
      const isLoggedIn = Boolean(auth?.user);
      const isLoginPage = pathname === "/login";
      const isAuthApi = pathname.startsWith("/api/auth");
      const isApiRoute = pathname.startsWith("/api/");

      if (isAuthApi) return true;

      // API는 기본 차단: 라우트 핸들러의 세션 검사가 누락되어도 공개되지 않도록 한다.
      if (isApiRoute) {
        if (isLoggedIn) return true;
        return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
      }

      if (isLoginPage) {
        if (isLoggedIn) {
          return Response.redirect(new URL("/", nextUrl));
        }
        return true;
      }

      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
