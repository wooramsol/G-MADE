import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/api-auth";
import { getAllProjects, purgeAllProjectEvaluationRounds } from "@/lib/project-store";
import { revalidateProjectViews } from "@/lib/revalidate-project-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 모든 프로젝트의 평가 차수(활성·휴지통)를 영구 삭제합니다. */
export async function POST() {
  const authResult = await requireAdminSession();
  if (authResult.response) return authResult.response;

  const { projectsUpdated } = await purgeAllProjectEvaluationRounds();
  const projects = await getAllProjects();
  revalidateProjectViews();

  return NextResponse.json({
    projectsUpdated,
    projects,
  });
}
