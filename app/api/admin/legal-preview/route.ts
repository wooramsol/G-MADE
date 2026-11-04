import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/api-auth";
import { attachRelevantLawArticles, buildEvaluationContext } from "@/lib/evaluation-context";
import { buildLegalCheck } from "@/lib/legal-check";
import { getProjectById } from "@/lib/project-store";
import { getLawOc } from "@/lib/law/config";
import { lawGetJson } from "@/lib/law/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const preferredRegion = "icn1";

/** 관리자 전용 — AI 호출 없이 법령 조문 선정·법정 기준 대조 결과만 미리보기 (점검용) */
export async function GET(request: NextRequest) {
  const auth = await requireAdminSession();
  if (auth.response) return auth.response;
  const mst = request.nextUrl.searchParams.get("mst");
  if (mst) {
    const oc = getLawOc();
    const result = await lawGetJson<Record<string, unknown>>("/DRF/lawService.do", { OC: oc ?? "", target: "ordin", type: "JSON", MST: mst }, "진단");
    const service = result.ok ? ((result.data.LawService ?? {}) as Record<string, unknown>) : {};
    return NextResponse.json({ ok: result.ok, byl: JSON.stringify(service["별표"] ?? null).slice(0, 4000) });
  }
  const projectId = request.nextUrl.searchParams.get("projectId") ?? "";
  const project = await getProjectById(projectId);
  if (!project) return NextResponse.json({ error: "프로젝트 없음" }, { status: 404 });
  const latest = [...(project.checklistReviews ?? [])].sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))[0];
  const context = await buildEvaluationContext(projectId);
  const sources = (context.lawSources ?? []).map((source) => source.title);
  await attachRelevantLawArticles(context, latest?.items ?? null);
  const legalCheck = await buildLegalCheck({
    point: context.spatial?.point ?? project.locationPoint ?? null,
    location: project.location,
    metrics: (latest?.metrics ?? []).map((metric) => ({ label: metric.label, value: metric.value })),
  });
  const show = request.nextUrl.searchParams.get("show");
  if (show) {
    const match = context.referenceLaws.find((law) => `${law.title} ${law.article}`.includes(show));
    return NextResponse.json({ found: Boolean(match), text: match?.summary ?? null });
  }
  return NextResponse.json({
    sources,
    articles: context.referenceLaws.map((law) => `${law.title} ${law.article} — ${law.summary.slice(0, 80)}`),
    hints: Object.fromEntries(Object.entries(context.articleHints ?? {}).slice(0, 12)),
    hintItems: (latest?.items ?? []).slice(0, 12).map((item) => `${item.id}: ${item.text.slice(0, 50)}`),
    legalCheck,
    warnings: context.warnings,
  });
}
