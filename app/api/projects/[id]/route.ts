import { NextRequest, NextResponse } from "next/server";
import { deleteCreatedProject, isDemoProjectId } from "@/lib/project-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (isDemoProjectId(id)) {
    return NextResponse.json({ error: "기본 예시 프로젝트는 삭제할 수 없습니다." }, { status: 400 });
  }

  const deleted = await deleteCreatedProject(id);

  if (!deleted) {
    return NextResponse.json({ error: "삭제할 프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
