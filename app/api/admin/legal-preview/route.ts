import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/api-auth";
import { attachRelevantLawArticles, buildEvaluationContext, buildEvaluationContextForProject } from "@/lib/evaluation-context";
import { finishLegalCheck, prepareLegalCheck } from "@/lib/legal-check";
import { geocodeAddress } from "@/lib/vworld/geocode";
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
  const lawTitle = request.nextUrl.searchParams.get("law");
  if (lawTitle) {
    const kw = request.nextUrl.searchParams.get("kw") ?? "";
    const { searchOrdins } = await import("@/lib/law/ordin-search");
    const { loadLawArticles } = await import("@/lib/law/corpus");
    const hits = await searchOrdins(lawTitle, { display: 30 });
    const hit = hits.find((entry) => entry.title.trim() === lawTitle) ?? hits[0];
    if (!hit) return NextResponse.json({ error: "없음" });
    const articles = await loadLawArticles({ kind: "ordin", mst: hit.ordinSeq, title: hit.title, sourceUrl: hit.sourceUrl });
    return NextResponse.json({
      title: hit.title,
      count: articles.length,
      matches: articles.filter((article) => article.title.includes(kw)).map((article) => `${article.no}${article.part ? "-" + article.part.no : ""} ${article.title}: ${article.text.slice(0, 700)}`),
    });
  }
  const ordq = request.nextUrl.searchParams.get("ordq");
  if (ordq) {
    const { searchOrdins } = await import("@/lib/law/ordin-search");
    const hits = await searchOrdins(ordq, { display: 10 }).catch((error) => [{ title: String(error), jurisdiction: "", ordinSeq: "" }]);
    return NextResponse.json({ hits: hits.map((hit) => `${hit.title} / ${hit.jurisdiction} / ${hit.ordinSeq}`) });
  }
  // 임의 주소로 지역별 조회 점검 (?address=...)
  const address = request.nextUrl.searchParams.get("address");
  if (address) {
    const point = await geocodeAddress(address).catch(() => null);
    const fake = {
      id: "preview",
      name: "점검",
      location: address,
      locationPoint: point ? { x: point.x, y: point.y, source: "address" as const } : undefined,
      client: "",
      designer: "",
      projectType: "",
      scale: "",
      reviewType: "경관심의",
      receivedAt: "",
      status: "접수" as const,
      files: [],
    };
    const context = await buildEvaluationContextForProject(fake);
    await attachRelevantLawArticles(context, null);
    const prep = await prepareLegalCheck({ point: fake.locationPoint ?? null, location: address });
    const legal = prep ? finishLegalCheck(prep, [{ label: "대지면적", value: "1000㎡" }, { label: "건축면적", value: "300㎡" }, { label: "연면적", value: "900㎡" }]) : null;
    const articles = context.referenceLaws.map((law) => `${law.title} ${law.article}`);
    return NextResponse.json({
      address,
      point: point ? [point.x, point.y] : null,
      sources: (context.lawSources ?? []).map((source) => source.title),
      attachments: articles.filter((label) => label.includes("[별표")),
      articleCount: articles.length,
      zone: legal?.zone ?? null,
      limits: legal?.rows.map((row) => `${row.label} ${row.limit ?? "-"} (${row.basis ?? "-"})`) ?? [],
      warnings: context.warnings,
    });
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
