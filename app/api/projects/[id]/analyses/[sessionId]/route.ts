import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getProjectById, removeProjectUploadAnalysis } from "@/lib/project-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; sessionId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id, sessionId } = await params;
  const existing = await getProjectById(id);
  if (!existing) {
    return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }

  const project = await removeProjectUploadAnalysis(id, sessionId);
  if (!project) {
    return NextResponse.json({ error: "분석 결과를 삭제할 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ project });
}
