import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getBlobAccess } from "@/lib/blob-config";
import { isBlobStorageEnabled } from "@/lib/blob-file-storage";
import { findStoredFileInProject } from "@/lib/project-file-pool";
import { getProjectById, removeProjectFile } from "@/lib/project-store";
import { revalidateProjectViews } from "@/lib/revalidate-project-paths";
import { deleteSavedUploadFiles, storedRefsToSavedFiles } from "@/lib/save-uploaded-files";

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

  // 검토 이력이 이 파일을 참조하면 삭제를 막습니다 — 지워버리면 그 이력의 근거
  // "원본 페이지 열기" 링크가 깨지고, 이력 목록의 자료 표시도 남아 혼란을 줍니다.
  // (이력을 먼저 지우면 참조가 사라져 깨끗하게 삭제 가능)
  const referencingReviews = (project.checklistReviews ?? []).filter((review) =>
    review.files.some(
      (entry) => entry.id === fileId || (file.storageKey && entry.storageKey === file.storageKey),
    ),
  );
  if (referencingReviews.length > 0) {
    return NextResponse.json(
      {
        error: `이 자료를 참조하는 검토 이력이 ${referencingReviews.length}건 있습니다. 검토 이력에서 해당 회차를 먼저 삭제한 뒤 다시 시도해 주세요.`,
      },
      { status: 409 },
    );
  }

  // 목록에서 제거하고 Blob(실제 파일)도 함께 삭제해 저장 공간을 정리합니다.
  if (file.storageKey) {
    try {
      await deleteSavedUploadFiles(storedRefsToSavedFiles([file]));
    } catch (error) {
      console.warn(
        `[project-files] Blob 삭제 실패 (${file.storageKey}):`,
        error instanceof Error ? error.message : error,
      );
      // Blob 삭제 실패는 목록 정리를 막지 않음 — 고아 Blob은 무해(참조 없음)
    }
  }

  const updatedProject = await removeProjectFile(projectId, fileId);
  if (!updatedProject) {
    return NextResponse.json({ error: "파일을 삭제하지 못했습니다." }, { status: 404 });
  }

  revalidateProjectViews(projectId);
  return NextResponse.json({ project: updatedProject });
}
