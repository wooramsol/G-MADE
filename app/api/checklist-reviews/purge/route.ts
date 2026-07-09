import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/api-auth";
import { getAllProjects, purgeAllProjectChecklistReviews } from "@/lib/project-store";
import { revalidateProjectViews } from "@/lib/revalidate-project-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 모든 프로젝트의 체크리스트 검토 기록을 영구 삭제합니다.
 * body의 excludeProjectIds에 지정한 프로젝트는 기록을 유지합니다.
 */
export async function POST(request: NextRequest) {
  const authResult = await requireAdminSession();
  if (authResult.response) return authResult.response;

  const body = (await request.json().catch(() => ({}))) as { excludeProjectIds?: unknown };
  const excludeProjectIds = Array.isArray(body.excludeProjectIds)
    ? body.excludeProjectIds.map(String).filter(Boolean)
    : [];

  const { projectsUpdated } = await purgeAllProjectChecklistReviews({ excludeProjectIds });
  const projects = await getAllProjects();
  revalidateProjectViews();

  return NextResponse.json({
    projectsUpdated,
    projects,
  });
}
