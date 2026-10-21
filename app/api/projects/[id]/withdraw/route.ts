import { NextResponse } from "next/server";
import { notifyOfficials } from "@/lib/notifications";
import { requireProjectAccess } from "@/lib/project-access";
import { trashProjectRecord, withdrawProjectApplication } from "@/lib/project-store";
import { revalidateProjectViews } from "@/lib/revalidate-project-paths";
import { applicantCanWithdraw } from "@/lib/roles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 지원자 신청 취소·철회
 * - 도서 접수 전: 신청 취소 (목록에서 삭제 — 공무원 휴지통으로 이동해 복원 가능)
 * - 도서 접수 후: 신청 철회 (기록은 남기고 '신청 철회' 상태로, 담당 공무원에게 알림)
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.response) return access.response;
  const { project, session, official } = access;
  if (official || project.ownerId !== session.user.id) {
    return NextResponse.json({ error: "신청자 본인만 취소·철회할 수 있습니다." }, { status: 403 });
  }
  if (!applicantCanWithdraw(project)) {
    return NextResponse.json({ error: "심의가 끝난 신청은 철회할 수 없습니다." }, { status: 409 });
  }

  if ((project.submissions ?? []).length === 0) {
    await trashProjectRecord(id);
    revalidateProjectViews(id);
    return NextResponse.json({ deleted: true });
  }

  const updated = await withdrawProjectApplication(id);
  if (!updated) return NextResponse.json({ error: "처리하지 못했습니다." }, { status: 500 });
  await notifyOfficials({
    kind: "WITHDRAWN",
    title: `신청 철회 · ${updated.name}`,
    body: `${session.user.name ?? "지원자"}가 심의 신청을 철회했습니다.`,
    link: `/projects/${id}`,
    projectId: id,
  });
  revalidateProjectViews(id);
  return NextResponse.json({ project: updated });
}
