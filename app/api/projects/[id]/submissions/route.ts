import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/project-access";
import { addProjectSubmission } from "@/lib/project-store";
import { revalidateProjectViews } from "@/lib/revalidate-project-paths";
import { applicantCanSubmit } from "@/lib/roles";
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

  if (!official && !applicantCanSubmit(project)) {
    return NextResponse.json({ error: "지금은 도서를 제출할 수 없습니다. 보완 요청을 받은 뒤 제출할 수 있습니다." }, { status: 409 });
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
  const updated = await addProjectSubmission(
    id,
    {
      id: `submission-${randomUUID()}`,
      file: {
        id: ref.id,
        originalName: ref.originalName,
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
  );
  if (!updated) return NextResponse.json({ error: "접수를 저장하지 못했습니다." }, { status: 500 });
  revalidateProjectViews(id);
  return NextResponse.json({ project: updated });
}
