import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Session } from "next-auth";

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
