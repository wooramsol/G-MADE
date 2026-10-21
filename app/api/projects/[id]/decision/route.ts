import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/project-access";
import { notifyUsers } from "@/lib/notifications";
import { addPreReviewDecision, setProjectStage } from "@/lib/project-store";
import { revalidateProjectViews } from "@/lib/revalidate-project-paths";
import type { PreReviewDecision, ProjectStage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DECISIONS = new Set<PreReviewDecision["decision"]>(["보완요청", "반려", "통과"]);
const STAGES = new Set<ProjectStage>(["RECEPTION", "PRE_REVIEW", "MAIN_REVIEW", "CLOSED", "REJECTED", "WITHDRAWN"]);

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
    const previousStage = access.project.stage;
    const updated = await setProjectStage(id, body.stage as ProjectStage);
    // 본심의 종료 → 지원자에게 '심의 종료, 결과 별도 통지' 안내
    if (updated?.ownerId && body.stage === "CLOSED" && previousStage !== "CLOSED") {
      await notifyUsers([updated.ownerId], {
        kind: "CLOSED",
        title: `심의가 종료되었습니다 · ${updated.name}`,
        body: "심의 결과는 담당부서에서 별도로 통지해 드릴 예정입니다.",
        link: `/projects/${id}`,
        projectId: id,
      });
    }
    revalidateProjectViews(id);
    return NextResponse.json({ project: updated });
  }

  const decision = body?.decision as PreReviewDecision["decision"];
  if (!DECISIONS.has(decision)) return NextResponse.json({ error: "판정 값이 올바르지 않습니다." }, { status: 400 });
  const note = String(body?.note ?? "").trim().slice(0, 2_000);
  // 통과 → 본심의는 'AI 분석된 최종 도서'로 진행되므로, 최근 접수본이 분석 전이면 막음
  if (decision === "통과") {
    const submissions = access.project.submissions ?? [];
    const latest = submissions[submissions.length - 1];
    const analyzed = new Set((access.project.checklistReviews ?? []).flatMap((review) => review.files.map((file) => file.storageKey)));
    if (latest && !analyzed.has(latest.file.storageKey)) {
      return NextResponse.json({ error: "최근 접수된 도서를 먼저 AI 분석한 뒤 통과 처리해 주세요." }, { status: 409 });
    }
  }
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

  // 지원자 알림 — 보완요청 / 본심의 진행 / 반려
  if (updated.ownerId) {
    const link = `/projects/${id}`;
    await notifyUsers([updated.ownerId], {
      kind: decision === "보완요청" ? "REVISION_REQUESTED" : decision === "통과" ? "MAIN_REVIEW" : "REJECTED",
      title:
        decision === "보완요청"
          ? `보완 요청이 있습니다 · ${updated.name}`
          : decision === "통과"
            ? `사전심의를 통과해 본심의 중입니다 · ${updated.name}`
            : `반려되었습니다 · ${updated.name}`,
      body: note || undefined,
      link,
      projectId: id,
    });
  }
  revalidateProjectViews(id);
  return NextResponse.json({ project: updated });
}
