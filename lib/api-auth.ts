import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Session } from "next-auth";
import type { RoleCode } from "@/lib/types";

type ApiSessionResult =
  | { session: Session; response: null }
  | { session: null; response: NextResponse };

export async function requireApiSession(): Promise<ApiSessionResult> {
  const session = await auth();

  if (!session?.user) {
    return {
      session: null,
      response: NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 }),
    };
  }

  return { session, response: null };
}

/** 세션 검사 후, 지정한 역할 중 하나가 아니면 403을 반환한다. */
export async function requireApiRole(...roles: RoleCode[]): Promise<ApiSessionResult> {
  const result = await requireApiSession();
  if (result.response) return result;

  const role = result.session.user?.role;
  if (!role || !roles.includes(role)) {
    return {
      session: null,
      response: NextResponse.json(
        { error: "이 작업을 수행할 권한이 없습니다." },
        { status: 403 },
      ),
    };
  }

  return result;
}
