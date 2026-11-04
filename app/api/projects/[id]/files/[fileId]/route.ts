import { get } from "@vercel/blob";
import { isR2Configured, r2HeadObject, r2PresignGetUrl } from "@/lib/r2-storage";
import { isTrustedBlobUrl } from "@/lib/trusted-blob-url";
import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/project-access";
import { projectForViewer } from "@/lib/roles";
import { getBlobAccess } from "@/lib/blob-config";
import { isBlobStorageEnabled } from "@/lib/blob-file-storage";
import { findStoredFileInProject } from "@/lib/project-file-pool";
import { removeProjectFile } from "@/lib/project-store";
import { revalidateProjectViews } from "@/lib/revalidate-project-paths";
import { deleteSavedUploadFiles, storedRefsToSavedFiles } from "@/lib/save-uploaded-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; fileId: string }> },
) {
  const { id: projectId, fileId } = await context.params;
  const access = await requireProjectAccess(projectId);
  if (access.response) return access.response;
  // 지원자는 자기가 제출한 도서만 열람 (분석용·내부 파일 제외)
  const project = projectForViewer(access.project, access.official);

  const file = findStoredFileInProject(project, fileId);
  if (!file) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }

  // R2 저장 파일 — 5분짜리 열람 주소로 이동
  if (file.storageKey && isR2Configured()) {
    try {
      if (await r2HeadObject(file.storageKey)) {
        return NextResponse.redirect(await r2PresignGetUrl(file.storageKey, 300));
      }
    } catch {
      // 아래 레거시 경로로
    }
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

  // 저장소 주소일 때만 이동 (외부 사이트로 보내지 않음)
  if (isTrustedBlobUrl(file.blobUrl)) {
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
  const { id: projectId, fileId } = await context.params;
  const access = await requireProjectAccess(projectId, { officialOnly: true });
  if (access.response) return access.response;
  const project = access.project;

  const file = findStoredFileInProject(project, fileId);
  if (!file) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }

  // 검토 이력이 이 파일을 참조하면 삭제를 막습니다 — 지워버리면 그 이력의 근거
  // "원본 페이지 열기" 링크가 깨지고, 이력 목록의 자료 표시도 남아 혼란을 줍니다.
  // (이력을 먼저 지우면 참조가 사라져 깨끗하게 삭제 가능)
  // 접수된 도서는 삭제 불가 — 접수 기록·심의 대상 도서가 깨지지 않도록
  if ((project.submissions ?? []).some((entry) => entry.file.id === fileId || (file.storageKey && entry.file.storageKey === file.storageKey))) {
    return NextResponse.json({ error: "접수된 도서 파일은 삭제할 수 없습니다." }, { status: 409 });
  }
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
