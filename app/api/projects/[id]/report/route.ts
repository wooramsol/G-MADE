import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildReportDocx, buildReportHtml } from "@/lib/report-export";
import { getProjectById } from "@/lib/project-store";
import { buildHybridViewFromSession } from "@/lib/upload-to-hybrid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) {
    return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "html";
  const sessionId = searchParams.get("sessionId");

  const analyses = [...(project.uploadAnalyses ?? [])].sort(
    (a, b) => new Date(b.analyzedAt).getTime() - new Date(a.analyzedAt).getTime(),
  );
  const targetSession = sessionId
    ? analyses.find((item) => item.id === sessionId)
    : analyses[0];

  if (!targetSession) {
    return NextResponse.json({ error: "보낼 분석 결과가 없습니다." }, { status: 400 });
  }

  const round = analyses.length - analyses.findIndex((item) => item.id === targetSession.id);
  const hybrid = buildHybridViewFromSession(targetSession, round);
  const generatedAt = new Date().toISOString().slice(0, 19).replace("T", " ");

  const payload = {
    project: {
      name: project.name,
      location: project.location,
      client: project.client,
      designer: project.designer,
      projectType: project.projectType,
      scale: project.scale,
      reviewType: project.reviewType,
      receivedAt: project.receivedAt,
    },
    session: targetSession,
    results: hybrid.results,
    projectScore: hybrid.projectScore,
    generatedAt,
  };

  if (format === "docx" || format === "hwp") {
    const buffer = await buildReportDocx(payload);
    const filename = encodeURIComponent(`${project.name}_평가보고서.docx`);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    });
  }

  const html = buildReportHtml(payload);
  if (format === "pdf") {
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `inline; filename="${project.name}-report.html"`,
      },
    });
  }

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
