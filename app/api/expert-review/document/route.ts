import { NextRequest, NextResponse } from "next/server";
import { requireOfficial } from "@/lib/project-access";
import { findStoredFileInProject } from "@/lib/project-file-pool";
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
  const authResult = await requireOfficial();
  if (authResult.response) return authResult.response;

  const params = request.nextUrl.searchParams;
  const projectId = params.get("projectId")?.trim() ?? "";
  const reviewId = params.get("reviewId")?.trim() ?? "";
  const fileId = params.get("fileId")?.trim() ?? "";
  if (!projectId || !fileId) {
    return NextResponse.json({ error: "projectId·fileId가 필요합니다." }, { status: 400 });
  }

  const project = await getProjectById(projectId);
  // 접수 도서(프로젝트 파일) 또는 AI 검토에 쓰인 파일 — AI 분석 전에도 열람 가능
  const file = project ? findStoredFileInProject(project, fileId) : null;
  if (!project || !file) {
    return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }

  const fallbackUrl = reviewId
    ? `/api/checklist-reviews/original-file?${new URLSearchParams({ projectId, reviewId, fileId })}`
    : `/api/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}`;
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
