import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { getProjectById } from "@/lib/project-store";
import { isR2Configured, r2HeadObject, r2PresignGetUrl } from "@/lib/r2-storage";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

/**
 * 전문가 분석 뷰어가 PDF를 받을 주소를 돌려준다.
 * 대용량 도서(수십 MB)는 서버를 거치지 않고 R2에서 바로 받도록 서명 URL을 주고,
 * R2에 없거나 브라우저가 직접 받지 못하면 같은 출처 프록시(original-file)로 받는다.
 */
export async function GET(request: NextRequest) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const params = request.nextUrl.searchParams;
  const projectId = params.get("projectId")?.trim() ?? "";
  const reviewId = params.get("reviewId")?.trim() ?? "";
  const fileId = params.get("fileId")?.trim() ?? "";
  if (!projectId || !reviewId || !fileId) {
    return NextResponse.json({ error: "projectId·reviewId·fileId가 필요합니다." }, { status: 400 });
  }

  const project = await getProjectById(projectId);
  const review = (project?.checklistReviews ?? []).find((entry) => entry.id === reviewId);
  const file = review?.files.find((entry) => entry.id === fileId);
  if (!project || !review || !file) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }

  const fallbackUrl = `/api/checklist-reviews/original-file?${new URLSearchParams({ projectId, reviewId, fileId })}`;
  let directUrl: string | null = null;
  if (isR2Configured() && file.storageKey) {
    try {
      if (await r2HeadObject(file.storageKey)) directUrl = await r2PresignGetUrl(file.storageKey, 3600);
    } catch (error) {
      console.warn("[expert-review] presign 실패", error instanceof Error ? error.message : error);
    }
  }

  return NextResponse.json({ directUrl, fallbackUrl, fileName: file.originalName, sizeBytes: file.sizeBytes });
}
