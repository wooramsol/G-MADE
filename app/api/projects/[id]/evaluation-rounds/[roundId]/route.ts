import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { revalidateProjectViews } from "@/lib/revalidate-project-paths";
import {
  getProjectById,
  purgeProjectEvaluationRound,
  trashProjectEvaluationRound,
} from "@/lib/project-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
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

  const permanent = request.nextUrl.searchParams.get("permanent") === "true";

  if (permanent) {
    const project = await purgeProjectEvaluationRound(id, roundId);
    if (!project) {
      return NextResponse.json({ error: "휴지통에 있는 평가만 영구 삭제할 수 있습니다." }, { status: 404 });
    }

    revalidateProjectViews(id);
    return NextResponse.json({ project });
  }

  const project = await trashProjectEvaluationRound(id, roundId);
  if (!project) {
    return NextResponse.json({ error: "평가 기록을 휴지통으로 이동하지 못했습니다." }, { status: 404 });
  }

  revalidateProjectViews(id);
  return NextResponse.json({ project });
}
