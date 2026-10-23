import { NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/project-access";
import { setProjectReviewers } from "@/lib/project-store";
import type { ReviewerMarker } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REVIEWERS = 40;

/** 본심의 심사위원 목록 저장 (공무원) — 계정 없이 이름·색상 마커만 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id, { officialOnly: true });
  if (access.response) return access.response;

  const body = (await request.json().catch(() => null)) as { reviewers?: unknown; phase?: unknown } | null;
  const phase = body?.phase === "pre" ? "pre" : "main";
  if (!Array.isArray(body?.reviewers)) return NextResponse.json({ error: "심사위원 목록이 필요합니다." }, { status: 400 });

  const reviewers: ReviewerMarker[] = [];
  const seen = new Set<string>();
  const seenNames = new Set<string>();
  for (const raw of body.reviewers.slice(0, MAX_REVIEWERS)) {
    const entry = raw as Partial<ReviewerMarker>;
    const name = String(entry.name ?? "").trim().slice(0, 30);
    const reviewerId = String(entry.id ?? "").trim().slice(0, 64);
    const color = /^#[0-9a-f]{6}$/i.test(String(entry.color)) ? String(entry.color) : "#b45309";
    // 같은 이름(띄어쓰기·대소문자 무시)은 한 명만
    const nameKey = name.replace(/\s+/g, "").toLowerCase();
    if (!name || !reviewerId || seen.has(reviewerId) || seenNames.has(nameKey)) continue;
    seen.add(reviewerId);
    seenNames.add(nameKey);
    reviewers.push({ id: reviewerId, name, color });
  }

  const updated = await setProjectReviewers(id, reviewers, phase);
  if (!updated) return NextResponse.json({ error: "저장하지 못했습니다." }, { status: 500 });
  return NextResponse.json({ reviewers: (phase === "pre" ? updated.preReviewers : updated.reviewers) ?? [] });
}
