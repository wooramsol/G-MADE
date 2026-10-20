import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { isOfficialRole } from "@/lib/roles";
import { ensureProjectRecordFromSnapshot } from "@/lib/ensure-project-record";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
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
    return NextResponse.json({ project: existing });
  }

  try {
    const snapshot = (await request.json()) as Project;
    if (!snapshot?.id || snapshot.id !== projectId) {
      return NextResponse.json({ error: "유효하지 않은 프로젝트 정보입니다." }, { status: 400 });
    }

    const project = await ensureProjectRecordFromSnapshot(snapshot);
    return NextResponse.json({ project });
  } catch (error) {
    const message = error instanceof Error ? error.message : "프로젝트 동기화에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
