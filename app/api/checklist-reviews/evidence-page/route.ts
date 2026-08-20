import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { extractPdfPages } from "@/lib/pdf/split-pdf";
import { getProjectById } from "@/lib/project-store";
import { readSavedUploadFile } from "@/lib/save-uploaded-files";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * 근거 페이지 1장을 추출하고 AI가 판독한 근거 위치(region)에 빨간 강조 박스를 그려
 * 반환합니다 — 근거 인용의 "p.N 📍" 클릭 시 마커가 표시된 페이지가 바로 열립니다.
 * (브라우저 기본 PDF 뷰어에는 오버레이를 얹을 수 없으므로 PDF 자체에 박스를 그림)
 */
export async function GET(request: NextRequest) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const params = request.nextUrl.searchParams;
  const projectId = params.get("projectId")?.trim() ?? "";
  const reviewId = params.get("reviewId")?.trim() ?? "";
  const fileId = params.get("fileId")?.trim() ?? "";
  const page = Number(params.get("page"));
  const clamp01 = (value: number) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : NaN);
  const x = clamp01(Number(params.get("x")));
  const y = clamp01(Number(params.get("y")));
  const width = clamp01(Number(params.get("w")));
  const height = clamp01(Number(params.get("h")));

  if (!projectId || !reviewId || !fileId || !Number.isFinite(page) || page < 1) {
    return NextResponse.json({ error: "projectId·reviewId·fileId·page가 필요합니다." }, { status: 400 });
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

    const extracted = await extractPdfPages(Buffer.from(bytes).toString("base64"), [page]);
    if (!extracted) {
      return NextResponse.json({ error: "해당 페이지를 추출하지 못했습니다." }, { status: 404 });
    }

    const { PDFDocument, rgb } = await import("pdf-lib");
    const doc = await PDFDocument.load(Buffer.from(extracted.base64, "base64"));
    const target = doc.getPage(0);

    // region 좌표(정규화 0~1, 좌상단 원점) -> PDF 좌표(pt, 좌하단 원점)
    if ([x, y, width, height].every((value) => Number.isFinite(value)) && width > 0 && height > 0) {
      const pw = target.getWidth();
      const ph = target.getHeight();
      target.drawRectangle({
        x: x * pw,
        y: ph - (y + height) * ph,
        width: width * pw,
        height: height * ph,
        borderColor: rgb(0.86, 0.15, 0.15),
        borderWidth: Math.max(2, pw / 300),
        color: rgb(0.86, 0.15, 0.15),
        opacity: 0.12,
        borderOpacity: 0.9,
      });
    }

    const annotated = await doc.save({ useObjectStreams: true });
    return new NextResponse(new Uint8Array(annotated), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(`p${page}-${file.originalName}`)}`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "근거 페이지를 불러오지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
