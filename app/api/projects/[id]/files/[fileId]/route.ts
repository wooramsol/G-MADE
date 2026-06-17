import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { findStoredFileInProject } from "@/lib/project-file-pool";
import { getProjectById } from "@/lib/project-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; fileId: string }> },
) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const { id: projectId, fileId } = await context.params;
  const project = await getProjectById(projectId);

  if (!project) {
    return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }

  const file = findStoredFileInProject(project, fileId);
  if (!file) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }

  if (file.blobUrl) {
    return NextResponse.redirect(file.blobUrl);
  }

  return NextResponse.json(
    { error: "이 파일은 아직 Blob에 저장되지 않아 열람할 수 없습니다." },
    { status: 404 },
  );
}
