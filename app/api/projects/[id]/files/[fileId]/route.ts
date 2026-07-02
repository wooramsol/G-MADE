import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getBlobAccess } from "@/lib/blob-config";
import { isBlobStorageEnabled } from "@/lib/blob-file-storage";
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

  if (file.storageKey && isBlobStorageEnabled()) {
    // private blob은 인증된 서버에서 스트리밍한다.
    try {
      const result = await get(file.storageKey, { access: getBlobAccess() });
      if (result?.stream) {
        return new Response(result.stream, {
          headers: {
            "Content-Type": result.blob.contentType ?? "application/octet-stream",
            "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
            "Cache-Control": "private, no-store",
          },
        });
      }
    } catch {
      // 과거 public 모드로 업로드된 blob은 아래 URL redirect로 처리한다.
    }
  }

  if (file.blobUrl) {
    return NextResponse.redirect(file.blobUrl);
  }

  return NextResponse.json(
    { error: "이 파일은 아직 Blob에 저장되지 않아 열람할 수 없습니다." },
    { status: 404 },
  );
}
