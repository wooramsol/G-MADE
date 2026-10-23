import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/project-access";
import { addProjectSubmission } from "@/lib/project-store";
import { revalidateProjectViews } from "@/lib/revalidate-project-paths";
import { notifyOfficials, notifyUsers } from "@/lib/notifications";
import { applicantSubmissionKind, projectStage, type SubmissionKind } from "@/lib/roles";
import { storedRefsToProjectFiles } from "@/lib/save-uploaded-files";
import type { StoredFileRef } from "@/lib/stored-file-ref";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 도서 접수·보완 제출 — 브라우저가 저장소에 파일을 올린 뒤 그 참조를 등록한다.
 * 지원자: 최초 접수 전, 또는 '보완요청'을 받은 뒤에만 가능.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.response) return access.response;
  const { project, session, official } = access;

  // 제출 종류 — 최초 접수 / 사전검토 보완 / 본심의용 수정 도서
  const applicantKind = applicantSubmissionKind(project);
  let kind: SubmissionKind | null = applicantKind;
  if (official && !kind) {
    // 공무원 대리 제출 — 도서접수·사전검토 단계에서만 (사전심의 이후·종료·반려·철회 상태에는 도서 추가 불가)
    const stage = projectStage(project);
    kind = stage === "RECEPTION" ? "initial" : stage === "SCREENING" ? "revision" : null;
  }
  if (!kind) {
    return NextResponse.json({ error: "지금은 도서를 제출할 수 없습니다. 담당부서의 요청을 받은 뒤 제출할 수 있습니다." }, { status: 409 });
  }

  const body = (await request.json().catch(() => null)) as { file?: StoredFileRef } | null;
  const ref = body?.file;
  if (!ref?.id || !ref.storageKey || !ref.originalName) {
    return NextResponse.json({ error: "파일 정보가 올바르지 않습니다." }, { status: 400 });
  }
  if (!ref.storageKey.startsWith(`projects/${id}/files/`)) {
    return NextResponse.json({ error: "다른 프로젝트의 파일은 등록할 수 없습니다." }, { status: 400 });
  }
  if (!/\.pdf$/i.test(ref.originalName)) {
    return NextResponse.json({ error: "도서는 PDF 파일로 제출해 주세요." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const submissionId = `submission-${randomUUID()}`;
  const updated = await addProjectSubmission(
    id,
    {
      id: submissionId,
      file: {
        id: ref.id,
        // 맥 업로드 파일명(NFD — 자모 분리)을 일반 형식으로 저장 (문서·다운로드에서 글자 깨짐 방지)
        originalName: ref.originalName.normalize("NFC"),
        fileType: ref.fileType || "application/pdf",
        sizeBytes: Number(ref.sizeBytes) || 0,
        storageKey: ref.storageKey,
        blobUrl: ref.blobUrl,
      },
      submittedAt: now,
      submittedBy: {
        id: session.user.id,
        name: session.user.name ?? session.user.email ?? "제출자",
        role: session.user.role,
      },
    },
    storedRefsToProjectFiles([ref], now)[0],
    { asMain: kind === "main", expectKind: applicantKind ?? undefined },
  );
  if (!updated) return NextResponse.json({ error: "접수를 저장하지 못했습니다." }, { status: 500 });
  if (!(updated.submissions ?? []).some((entry) => entry.id === submissionId)) {
    return NextResponse.json({ error: "이미 제출되었거나 단계가 바뀌었습니다. 화면을 새로고침해 주세요." }, { status: 409 });
  }

  // 알림 — 공무원: 신규 접수/보완 제출/수정 도서 제출, 지원자(소유자): 단계 안내
  const round = (updated.submissions ?? []).length;
  const link = `/projects/${id}`;
  const submitter = `${session.user.name ?? "지원자"} · ${ref.originalName.normalize("NFC")}`;
  if (!official) {
    await notifyOfficials(
      kind === "initial"
        ? { kind: "NEW_SUBMISSION", title: `신규 도서 접수 · ${updated.name}`, body: submitter, link, projectId: id }
        : kind === "main"
          ? { kind: "MAIN_SUBMISSION", title: `본심의 수정 도서 제출 · ${updated.name}`, body: submitter, link, projectId: id }
          : { kind: "RESUBMISSION", title: `보완 도서 제출 (${round - 1}차) · ${updated.name}`, body: submitter, link, projectId: id },
      session.user.id,
    );
  }
  if (updated.ownerId) {
    await notifyUsers([updated.ownerId], {
      kind: kind === "main" ? "MAIN_REVIEW" : "SCREENING",
      title:
        kind === "main"
          ? `수정 도서가 접수되어 본심의 중입니다 · ${updated.name}`
          : kind === "initial"
            ? `도서가 접수되어 사전검토 중입니다 · ${updated.name}`
            : `보완 도서가 접수되어 사전검토 중입니다 · ${updated.name}`,
      link,
      projectId: id,
    });
  }
  revalidateProjectViews(id);
  return NextResponse.json({ project: updated });
}
