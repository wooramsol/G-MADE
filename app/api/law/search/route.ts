import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchLawReferences } from "@/lib/law/articles";
import { isLawApiConfigured } from "@/lib/law/config";
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

  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  try {
    const hits = await searchLaws(query, 8);
    if (!withArticles) {
      return NextResponse.json({ results: hits });
    }

    const references = await fetchLawReferences(hits, 5);
    return NextResponse.json({ results: hits, references });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "법령 검색 중 오류가 발생했습니다." },
      { status: 502 },
    );
  }
}
