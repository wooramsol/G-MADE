import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getProjectById } from "@/lib/project-store";
import { readSavedUploadFile } from "@/lib/save-uploaded-files";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * 검토에 사용된 원본 PDF를 브라우저 인라인으로 스트리밍합니다.
 * 근거 인용의 "p.N" 클릭 시 이 URL + #page=N 앵커로 해당 페이지가 바로 열립니다.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const projectId = request.nextUrl.searchParams.get("projectId")?.trim() ?? "";
  const reviewId = request.nextUrl.searchParams.get("reviewId")?.trim() ?? "";
  const fileId = request.nextUrl.searchParams.get("fileId")?.trim() ?? "";
  if (!projectId || !reviewId || !fileId) {
    return NextResponse.json({ error: "projectId·reviewId·fileId가 필요합니다." }, { status: 400 });
  }

  const project = await getProjectById(projectId);
  const review = (project?.checklistReviews ?? []).find((entry) => entry.id === reviewId);
  const file = review?.files.find((entry) => entry.id === fileId);
  if (!project || !review || !file) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const bytes = await readSavedUploadFile({
      id: file.id,
      originalName: file.originalName,
      fileType: file.fileType,
      sizeBytes: file.sizeBytes,
      storageKey: file.storageKey ?? "",
      blobUrl: file.blobUrl,
    });

    const isPdf = /\.pdf$/i.test(file.originalName);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": isPdf ? "application/pdf" : "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "원본 파일을 불러오지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
