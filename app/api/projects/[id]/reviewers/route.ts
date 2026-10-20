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

  const body = (await request.json().catch(() => null)) as { reviewers?: unknown } | null;
  if (!Array.isArray(body?.reviewers)) return NextResponse.json({ error: "심사위원 목록이 필요합니다." }, { status: 400 });

  const reviewers: ReviewerMarker[] = [];
  const seen = new Set<string>();
  for (const raw of body.reviewers.slice(0, MAX_REVIEWERS)) {
    const entry = raw as Partial<ReviewerMarker>;
    const name = String(entry.name ?? "").trim().slice(0, 30);
    const reviewerId = String(entry.id ?? "").trim().slice(0, 64);
    const color = /^#[0-9a-f]{6}$/i.test(String(entry.color)) ? String(entry.color) : "#b45309";
    if (!name || !reviewerId || seen.has(reviewerId)) continue;
    seen.add(reviewerId);
    reviewers.push({ id: reviewerId, name, color });
  }

  const updated = await setProjectReviewers(id, reviewers);
  if (!updated) return NextResponse.json({ error: "저장하지 못했습니다." }, { status: 500 });
  return NextResponse.json({ reviewers: updated.reviewers ?? [] });
}
