import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { listNotifications, markNotificationsRead } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 내 알림 목록 + 안 읽은 개수 */
export async function GET() {
  const auth = await requireApiSession();
  if (auth.response) return auth.response;
  return NextResponse.json(await listNotifications(auth.session.user.id), { headers: { "Cache-Control": "no-store" } });
}

/** 읽음 처리 — { ids: [...] } 또는 { all: true } */
export async function POST(request: NextRequest) {
  const auth = await requireApiSession();
  if (auth.response) return auth.response;
  const body = (await request.json().catch(() => null)) as { ids?: unknown; all?: unknown } | null;
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string").slice(0, 200) : [];
  await markNotificationsRead(auth.session.user.id, body?.all === true ? "all" : ids);
  return NextResponse.json(await listNotifications(auth.session.user.id));
}
