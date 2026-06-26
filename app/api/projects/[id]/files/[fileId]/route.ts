import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { findStoredFileInProject } from "@/lib/project-file-pool";
import { getProjectById, removeProjectFile } from "@/lib/project-store";
import { revalidateProjectViews } from "@/lib/revalidate-project-paths";

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

export async function DELETE(
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

  const updatedProject = await removeProjectFile(projectId, fileId);
  if (!updatedProject) {
    return NextResponse.json({ error: "파일을 삭제하지 못했습니다." }, { status: 404 });
  }

  revalidateProjectViews(projectId);
  return NextResponse.json({ project: updatedProject });
}
