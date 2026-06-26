import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getProjectById, trashProjectEvaluationRound } from "@/lib/project-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; roundId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id, roundId } = await params;
  const existing = await getProjectById(id);
  if (!existing) {
    return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }

  const project = await trashProjectEvaluationRound(id, roundId);
  if (!project) {
    return NextResponse.json({ error: "평가 기록을 휴지통으로 이동하지 못했습니다." }, { status: 404 });
  }

  return NextResponse.json({ project });
}
