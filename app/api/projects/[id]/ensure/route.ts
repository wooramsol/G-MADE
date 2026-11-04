import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { isOfficialRole, projectForViewer } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const { id: projectId } = await context.params;
  // 클라이언트 스냅샷으로 프로젝트를 되살리는 기능 — 지원자는 기존 기록만 확인
  if (!isOfficialRole(authResult.session.user.role)) {
    const { getProjectById } = await import("@/lib/project-store");
    const existing = await getProjectById(projectId);
    if (!existing || existing.ownerId !== authResult.session.user.id) {
      return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    }
    return NextResponse.json({ project: projectForViewer(existing, false) });
  }

  // 브라우저 스냅샷으로 서버 기록을 만들거나 덮어쓰지 않음 — 서버에 있는 기록만 확인
  const { getProjectById } = await import("@/lib/project-store");
  const existing = await getProjectById(projectId);
  if (!existing) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다. 페이지를 새로고침해 주세요." }, { status: 404 });
  return NextResponse.json({ project: existing });
}
