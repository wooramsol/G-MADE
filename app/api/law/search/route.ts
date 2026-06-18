import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchAdmrulReferences } from "@/lib/law/admrul-articles";
import { fetchLawReferences } from "@/lib/law/articles";
import { buildAdmrulReferenceUrl, buildLawReferenceUrl } from "@/lib/reference-links";
import { isLawApiConfigured } from "@/lib/law/config";
import { searchAdmruls } from "@/lib/law/admrul-search";
import { searchLaws } from "@/lib/law/search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  if (!isLawApiConfigured()) {
    return NextResponse.json({ error: "LAW_OC가 설정되지 않았습니다." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const withArticles = searchParams.get("articles") === "true";
  const type = searchParams.get("type") === "admrul" ? "admrul" : "law";

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    if (type === "admrul") {
      const hits = await searchAdmruls(query, 8);
      if (!withArticles) {
        return NextResponse.json({ results: hits, type: "admrul" });
      }

      const references = (await fetchAdmrulReferences(hits, 5)).filter(
        (reference) => buildAdmrulReferenceUrl(reference.title, reference.sourceUrl) !== null,
      );
      const verifiedHits = hits.filter(
        (hit) => buildAdmrulReferenceUrl(hit.title, hit.sourceUrl) !== null,
      );
      return NextResponse.json({ results: verifiedHits, references, type: "admrul" });
    }

    const hits = await searchLaws(query, 8);
    if (!withArticles) {
      return NextResponse.json({ results: hits, type: "law" });
    }

    const references = (await fetchLawReferences(hits, 5)).filter(
      (reference) => buildLawReferenceUrl(reference.title, reference.sourceUrl) !== null,
    );
    const verifiedHits = hits.filter((hit) => buildLawReferenceUrl(hit.title, hit.sourceUrl) !== null);
    return NextResponse.json({ results: verifiedHits, references, type: "law" });
  } catch (error) {
    const label = type === "admrul" ? "행정규칙" : "법령";
    return NextResponse.json(
      { error: error instanceof Error ? error.message : `${label} 검색 중 오류가 발생했습니다.` },
      { status: 502 },
    );
  }
}
