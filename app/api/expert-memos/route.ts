import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import {
  addProjectExpertMemo,
  getProjectById,
  removeProjectExpertMemo,
  updateProjectExpertMemo,
} from "@/lib/project-store";
import type { ExpertMemo } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 사전심의: 전문가 분석 — 도서 위 영역 메모.
 * 메모는 작성자 이름과 함께 프로젝트 사용자 모두에게 공유되고, 수정·삭제는 작성자(또는 관리자)만.
 */

const MAX_TEXT = 4_000;

function clamp01(value: unknown): number | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(1, Math.max(0, number));
}

function parseRegion(value: unknown): ExpertMemo["region"] | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const x = clamp01(raw.x);
  const y = clamp01(raw.y);
  const width = clamp01(raw.width);
  const height = clamp01(raw.height);
  if (x === null || y === null || width === null || height === null) return null;
  if (width < 0.002 || height < 0.002) return null;
  return { x, y, width: Math.min(width, 1 - x), height: Math.min(height, 1 - y) };
}

export async function GET(request: NextRequest) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const projectId = request.nextUrl.searchParams.get("projectId")?.trim() ?? "";
  const project = projectId ? await getProjectById(projectId) : undefined;
  if (!project) return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });

  const user = authResult.session.user;
  return NextResponse.json({
    memos: project.expertMemos ?? [],
    currentUserId: user.id,
    isAdmin: user.role === "ADMIN",
  });
}

export async function POST(request: NextRequest) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
  const versionKey = typeof body?.versionKey === "string" ? body.versionKey.trim() : "";
  const reviewId = typeof body?.reviewId === "string" ? body.reviewId.trim() : "";
  const fileId = typeof body?.fileId === "string" ? body.fileId.trim() : "";
  const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_TEXT) : "";
  const page = Number(body?.page);
  const region = parseRegion(body?.region);

  if (!projectId || !versionKey || !reviewId || !fileId || !Number.isInteger(page) || page < 1 || !region) {
    return NextResponse.json({ error: "메모 위치 정보가 올바르지 않습니다." }, { status: 400 });
  }
  if (!text) return NextResponse.json({ error: "메모 내용을 입력해 주세요." }, { status: 400 });

  const project = await getProjectById(projectId);
  const review = (project?.checklistReviews ?? []).find((entry) => entry.id === reviewId);
  const file = review?.files.find((entry) => entry.id === fileId);
  if (!project || !review || !file) {
    return NextResponse.json({ error: "도서 파일을 찾을 수 없습니다." }, { status: 404 });
  }

  const user = authResult.session.user;
  const memo: ExpertMemo = {
    id: `memo-${randomUUID()}`,
    versionKey,
    reviewId,
    fileId,
    fileName: file.originalName,
    page,
    region,
    text,
    authorId: user.id,
    authorName: user.name?.trim() || user.email?.split("@")[0] || "검토자",
    createdAt: new Date().toISOString(),
  };

  const updated = await addProjectExpertMemo(projectId, memo);
  if (!updated) return NextResponse.json({ error: "메모를 저장하지 못했습니다." }, { status: 500 });
  return NextResponse.json({ memo, memos: updated.expertMemos ?? [] });
}

async function loadOwnMemo(projectId: string, memoId: string, userId: string, isAdmin: boolean) {
  const project = projectId ? await getProjectById(projectId) : undefined;
  const memo = (project?.expertMemos ?? []).find((entry) => entry.id === memoId);
  if (!project || !memo) {
    return { error: NextResponse.json({ error: "메모를 찾을 수 없습니다." }, { status: 404 }) };
  }
  if (memo.authorId !== userId && !isAdmin) {
    return { error: NextResponse.json({ error: "본인이 작성한 메모만 수정·삭제할 수 있습니다." }, { status: 403 }) };
  }
  return { memo };
}

export async function PATCH(request: NextRequest) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
  const memoId = typeof body?.memoId === "string" ? body.memoId.trim() : "";
  const user = authResult.session.user;
  const check = await loadOwnMemo(projectId, memoId, user.id, user.role === "ADMIN");
  if (check.error) return check.error;

  const patch: { text?: string; region?: ExpertMemo["region"] } = {};
  if (typeof body?.text === "string") {
    const text = body.text.trim().slice(0, MAX_TEXT);
    if (!text) return NextResponse.json({ error: "메모 내용을 입력해 주세요." }, { status: 400 });
    patch.text = text;
  }
  if (body?.region !== undefined) {
    const region = parseRegion(body.region);
    if (!region) return NextResponse.json({ error: "영역 정보가 올바르지 않습니다." }, { status: 400 });
    patch.region = region;
  }

  const updated = await updateProjectExpertMemo(projectId, memoId, patch);
  if (!updated) return NextResponse.json({ error: "메모를 저장하지 못했습니다." }, { status: 500 });
  return NextResponse.json({ memos: updated.expertMemos ?? [] });
}

export async function DELETE(request: NextRequest) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const projectId = request.nextUrl.searchParams.get("projectId")?.trim() ?? "";
  const memoId = request.nextUrl.searchParams.get("memoId")?.trim() ?? "";
  const user = authResult.session.user;
  const check = await loadOwnMemo(projectId, memoId, user.id, user.role === "ADMIN");
  if (check.error) return check.error;

  const updated = await removeProjectExpertMemo(projectId, memoId);
  if (!updated) return NextResponse.json({ error: "메모를 삭제하지 못했습니다." }, { status: 500 });
  return NextResponse.json({ memos: updated.expertMemos ?? [] });
}
