import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getProjectRecordById, restoreProjectRecord } from "@/lib/project-store";
import { isProjectTrashed } from "@/lib/trash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const { id } = await params;
  const existing = await getProjectRecordById(id);

  if (!existing) {
    return NextResponse.json({ error: "복원할 프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }

  if (!isProjectTrashed(existing)) {
    return NextResponse.json({ error: "휴지통에 있는 프로젝트만 복원할 수 있습니다." }, { status: 400 });
  }

  const project = await restoreProjectRecord(id);
  if (!project) {
    return NextResponse.json({ error: "프로젝트 복원에 실패했습니다." }, { status: 404 });
  }

  return NextResponse.json({ project });
}
