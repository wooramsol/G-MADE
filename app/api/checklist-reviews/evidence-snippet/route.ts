import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { renderRegionSnippet } from "@/lib/pdf/render-page";
import { getProjectById } from "@/lib/project-store";
import { readSavedUploadFile } from "@/lib/save-uploaded-files";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/**
 * 근거 위치(region) 부위만 잘라 빨간 테두리를 그린 캡처(JPEG)를 반환합니다 —
 * 결과 카드에서 하이퍼링크 클릭 없이 근거 부위를 바로 보여주는 인라인 썸네일용.
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
  const region = {
    x: clamp01(Number(params.get("x"))),
    y: clamp01(Number(params.get("y"))),
    width: clamp01(Number(params.get("w"))),
    height: clamp01(Number(params.get("h"))),
  };

  if (
    !projectId ||
    !reviewId ||
    !fileId ||
    !Number.isFinite(page) ||
    page < 1 ||
    ![region.x, region.y, region.width, region.height].every((value) => Number.isFinite(value)) ||
    region.width <= 0 ||
    region.height <= 0
  ) {
    return NextResponse.json({ error: "projectId·reviewId·fileId·page·region이 필요합니다." }, { status: 400 });
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

    const snippet = await renderRegionSnippet(Buffer.from(bytes).toString("base64"), page, region);
    if (!snippet) {
      return NextResponse.json({ error: "근거 부위 캡처를 생성하지 못했습니다." }, { status: 404 });
    }

    return new NextResponse(Buffer.from(snippet.base64, "base64"), {
      headers: {
        "Content-Type": snippet.mediaType,
        // 검토 결과는 불변이므로 브라우저 캐시를 길게 — 같은 카드 재방문 시 재렌더링 없음
        "Cache-Control": "private, max-age=604800, immutable",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "근거 캡처를 불러오지 못했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
