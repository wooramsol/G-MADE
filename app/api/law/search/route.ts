import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchAdmbylReferences } from "@/lib/law/admbyl-articles";
import { searchAdmbyls } from "@/lib/law/admbyl-search";
import { fetchAdmrulReferences } from "@/lib/law/admrul-articles";
import { fetchLawReferences } from "@/lib/law/articles";
import { fetchOrdinReferences } from "@/lib/law/ordin-articles";
import {
  buildAdmbylReferenceUrl,
  buildAdmrulReferenceUrl,
  buildLawReferenceUrl,
  buildOrdinReferenceUrl,
} from "@/lib/reference-links";
import { isLawApiConfigured } from "@/lib/law/config";
import { searchAdmruls } from "@/lib/law/admrul-search";
import { searchOrdins } from "@/lib/law/ordin-search";
import { searchLaws } from "@/lib/law/search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type LawSearchType = "law" | "admrul" | "ordin" | "admbyl";

function resolveSearchType(value: string | null): LawSearchType {
  if (value === "admrul" || value === "ordin" || value === "admbyl") return value;
  return "law";
}

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
  const type = resolveSearchType(searchParams.get("type"));
  const org = searchParams.get("org")?.trim() || null;

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    if (type === "admrul") {
      const hits = await searchAdmruls(query, 8);
      if (!withArticles) {
        return NextResponse.json({ results: hits, type });
      }

      const references = (await fetchAdmrulReferences(hits, 5)).filter(
        (reference) => buildAdmrulReferenceUrl(reference.title, reference.sourceUrl) !== null,
      );
      const verifiedHits = hits.filter(
        (hit) => buildAdmrulReferenceUrl(hit.title, hit.sourceUrl) !== null,
      );
      return NextResponse.json({ results: verifiedHits, references, type });
    }

    if (type === "ordin") {
      const hits = await searchOrdins(query, { display: 8, orgCode: org });
      if (!withArticles) {
        return NextResponse.json({ results: hits, type });
      }

      const references = (await fetchOrdinReferences(hits, 5)).filter(
        (reference) => buildOrdinReferenceUrl(reference.title, reference.sourceUrl) !== null,
      );
      const verifiedHits = hits.filter(
        (hit) => buildOrdinReferenceUrl(hit.title, hit.sourceUrl) !== null,
      );
      return NextResponse.json({ results: verifiedHits, references, type });
    }

    if (type === "admbyl") {
      const hits = await searchAdmbyls(query, { display: 8, kind: "2" });
      if (!withArticles) {
        return NextResponse.json({ results: hits, type });
      }

      const references = (await fetchAdmbylReferences(hits, 5)).filter(
        (reference) => buildAdmbylReferenceUrl(reference.title, reference.sourceUrl) !== null,
      );
      const verifiedHits = hits.filter(
        (hit) => buildAdmbylReferenceUrl(hit.title, hit.sourceUrl) !== null,
      );
      return NextResponse.json({ results: verifiedHits, references, type });
    }

    const hits = await searchLaws(query, 8);
    if (!withArticles) {
      return NextResponse.json({ results: hits, type });
    }

    const references = (await fetchLawReferences(hits, 5)).filter(
      (reference) => buildLawReferenceUrl(reference.title, reference.sourceUrl) !== null,
    );
    const verifiedHits = hits.filter((hit) => buildLawReferenceUrl(hit.title, hit.sourceUrl) !== null);
    return NextResponse.json({ results: verifiedHits, references, type });
  } catch (error) {
    const labels: Record<LawSearchType, string> = {
      law: "법령",
      admrul: "행정규칙",
      ordin: "자치법규",
      admbyl: "별표·서식",
    };
    return NextResponse.json(
      { error: error instanceof Error ? error.message : `${labels[type]} 검색 중 오류가 발생했습니다.` },
      { status: 502 },
    );
  }
}
