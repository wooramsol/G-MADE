import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { buildAnnotatedPdf, collectAnnotationsForFile } from "@/lib/checklist-review/annotated-pdf";
import { getProjectById } from "@/lib/project-store";
import { readSavedUploadFile } from "@/lib/save-uploaded-files";
import { formatUploadDateTime } from "@/lib/format-datetime";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * AI 검토 근거를 원본 PDF 위에 번호·색상 영역으로 표시한 '표시 도면 PDF'를 반환합니다.
 * 브라우저에서 바로 열람(inline)되며, 그대로 다운로드할 수 있습니다.
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
  if (!project || !review) {
    return NextResponse.json({ error: "검토 기록을 찾을 수 없습니다." }, { status: 404 });
  }

  const file = review.files.find((entry) => entry.id === fileId);
  if (!file || !/\.pdf$/i.test(file.originalName)) {
    return NextResponse.json({ error: "대상 PDF 파일을 찾을 수 없습니다." }, { status: 404 });
  }

  const annotations = collectAnnotationsForFile(review, file.originalName);
  if (annotations.length === 0) {
    return NextResponse.json({ error: "이 파일에는 표시할 근거 좌표가 없습니다." }, { status: 404 });
  }

  try {
    const originalBytes = await readSavedUploadFile({
      id: file.id,
      originalName: file.originalName,
      fileType: file.fileType,
      sizeBytes: file.sizeBytes,
      storageKey: file.storageKey ?? "",
      blobUrl: file.blobUrl,
    });

    const fontResponse = await fetch(new URL("/fonts/NanumGothic-Regular.ttf", request.nextUrl.origin));
    if (!fontResponse.ok) {
      throw new Error("주석용 한글 폰트를 불러오지 못했습니다.");
    }
    const fontBytes = await fontResponse.arrayBuffer();

    const annotated = await buildAnnotatedPdf(new Uint8Array(originalBytes), annotations, fontBytes, {
      fileName: file.originalName,
      reviewedAt: formatUploadDateTime(review.reviewedAt),
    });

    const downloadName = `${file.originalName.replace(/\.pdf$/i, "")}_AI표시.pdf`;
    return new NextResponse(Buffer.from(annotated), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "표시 도면 PDF 생성에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
