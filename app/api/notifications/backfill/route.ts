import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/api-auth";
import { notifyOfficials, notifyUsers } from "@/lib/notifications";
import { getPrismaClient } from "@/lib/prisma";
import { getAllProjects } from "@/lib/project-store";
import { projectStage } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 알림 기능 도입 전에 접수된 건의 알림을 한 번 채워 넣는다 (관리자 전용, 여러 번 눌러도 중복 생성 안 함).
 * 공무원: 최근 접수(아직 판정 전) / 지원자: 현재 단계
 */
export async function POST() {
  const auth = await requireAdminSession();
  if (auth.response) return auth.response;
  const prisma = getPrismaClient();
  if (!prisma) return NextResponse.json({ error: "DB를 사용할 수 없습니다." }, { status: 503 });

  let created = 0;
  for (const project of await getAllProjects()) {
    const submissions = project.submissions ?? [];
    if (submissions.length === 0) continue;
    const existing = await prisma.notification.count({ where: { projectId: project.id } });
    if (existing > 0) continue;

    const last = submissions[submissions.length - 1];
    const decisions = project.preReviewDecisions ?? [];
    const lastDecision = decisions[decisions.length - 1];
    const link = `/projects/${project.id}`;
    const stage = projectStage(project);

    // 공무원 — 판정 전 접수 건
    if (stage === "PRE_REVIEW" && (!lastDecision || last.submittedAt > lastDecision.decidedAt)) {
      await notifyOfficials({
        kind: submissions.length === 1 ? "NEW_SUBMISSION" : "RESUBMISSION",
        title: submissions.length === 1 ? `신규 도서 접수 · ${project.name}` : `보완 도서 제출 (${submissions.length - 1}차) · ${project.name}`,
        body: `${last.submittedBy.name} · ${last.file.originalName}`,
        link,
        projectId: project.id,
      });
      created += 1;
    }
    // 지원자 — 현재 단계
    if (project.ownerId) {
      const revision = stage === "PRE_REVIEW" && lastDecision?.decision === "보완요청" && last.submittedAt < lastDecision.decidedAt;
      await notifyUsers([project.ownerId], {
        kind: stage === "MAIN_REVIEW" ? "MAIN_REVIEW" : stage === "REJECTED" ? "REJECTED" : revision ? "REVISION_REQUESTED" : "PRE_REVIEW",
        title:
          stage === "MAIN_REVIEW"
            ? `사전심의를 통과해 본심의 중입니다 · ${project.name}`
            : stage === "REJECTED"
              ? `반려되었습니다 · ${project.name}`
              : revision
                ? `보완 요청이 있습니다 · ${project.name}`
                : `도서가 접수되어 사전심의 중입니다 · ${project.name}`,
        body: revision || stage === "REJECTED" ? lastDecision?.note : undefined,
        link,
        projectId: project.id,
      });
      created += 1;
    }
  }
  return NextResponse.json({ created });
}
