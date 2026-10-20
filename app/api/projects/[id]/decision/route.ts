import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/project-access";
import { addPreReviewDecision, setProjectStage } from "@/lib/project-store";
import { revalidateProjectViews } from "@/lib/revalidate-project-paths";
import type { PreReviewDecision, ProjectStage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DECISIONS = new Set<PreReviewDecision["decision"]>(["보완요청", "반려", "통과"]);
const STAGES = new Set<ProjectStage>(["RECEPTION", "PRE_REVIEW", "MAIN_REVIEW", "REJECTED"]);

/**
 * 사전심의 판정 (공무원) — 보완요청 / 반려 / 통과(→ 본심의).
 * { stage } 만 보내면 단계를 직접 되돌린다 (판정 번복 등).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id, { officialOnly: true });
  if (access.response) return access.response;

  const body = (await request.json().catch(() => null)) as { decision?: string; note?: string; stage?: string } | null;

  if (body?.stage && !body.decision) {
    if (!STAGES.has(body.stage as ProjectStage)) return NextResponse.json({ error: "단계 값이 올바르지 않습니다." }, { status: 400 });
    const updated = await setProjectStage(id, body.stage as ProjectStage);
    revalidateProjectViews(id);
    return NextResponse.json({ project: updated });
  }

  const decision = body?.decision as PreReviewDecision["decision"];
  if (!DECISIONS.has(decision)) return NextResponse.json({ error: "판정 값이 올바르지 않습니다." }, { status: 400 });
  const note = String(body?.note ?? "").trim().slice(0, 2_000);
  if (decision !== "통과" && !note) {
    return NextResponse.json({ error: "보완요청·반려 사유를 적어 주세요. 지원자 화면에 표시됩니다." }, { status: 400 });
  }

  const user = access.session.user;
  const updated = await addPreReviewDecision(id, {
    id: `decision-${randomUUID()}`,
    decision,
    note: note || undefined,
    decidedAt: new Date().toISOString(),
    decidedBy: { id: user.id, name: user.name ?? user.email ?? "공무원" },
  });
  if (!updated) return NextResponse.json({ error: "판정을 저장하지 못했습니다." }, { status: 500 });
  revalidateProjectViews(id);
  return NextResponse.json({ project: updated });
}
