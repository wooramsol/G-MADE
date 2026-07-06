import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { clearProjectEvaluationRounds, getProjectById } from "@/lib/project-store";
import { revalidateProjectViews } from "@/lib/revalidate-project-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 프로젝트의 활성·휴지통 평가 차수를 모두 영구 삭제합니다. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const existing = await getProjectById(id);
  if (!existing) {
    return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }

  const activeCount = existing.evaluationRounds?.length ?? 0;
  const trashedCount = existing.trashedEvaluationRounds?.length ?? 0;
  if (activeCount === 0 && trashedCount === 0) {
    return NextResponse.json({ error: "삭제할 평가 기록이 없습니다." }, { status: 404 });
  }

  const project = await clearProjectEvaluationRounds(id);
  if (!project) {
    return NextResponse.json({ error: "평가 기록을 삭제하지 못했습니다." }, { status: 404 });
  }

  revalidateProjectViews(id);
  return NextResponse.json({
    project,
    deletedCount: activeCount + trashedCount,
  });
}
