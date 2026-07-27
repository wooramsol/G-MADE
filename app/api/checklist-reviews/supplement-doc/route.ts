import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { buildSupplementDoc } from "@/lib/checklist-review/supplement-doc";
import { formatUploadDateTime } from "@/lib/format-datetime";
import { getProjectById } from "@/lib/project-store";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** 보완요구서 초안(.docx) 다운로드 — 미충족·부분충족·확인불가 항목 정리본. */
export async function GET(request: NextRequest) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const projectId = request.nextUrl.searchParams.get("projectId")?.trim() ?? "";
  const reviewId = request.nextUrl.searchParams.get("reviewId")?.trim() ?? "";
  if (!projectId || !reviewId) {
    return NextResponse.json({ error: "projectId·reviewId가 필요합니다." }, { status: 400 });
  }

  const project = await getProjectById(projectId);
  const review = (project?.checklistReviews ?? []).find((entry) => entry.id === reviewId);
  if (!project || !review) {
    return NextResponse.json({ error: "검토 기록을 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const buffer = await buildSupplementDoc(project, review, formatUploadDateTime(review.reviewedAt));
    const downloadName = `보완요구서_초안_${project.name}_${review.reviewedAt.slice(0, 10)}.docx`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "보완요구서 생성에 실패했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
