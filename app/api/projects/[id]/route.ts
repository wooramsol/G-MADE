import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import {
  getProjectById,
  getStoredProjectRecord,
  purgeProjectRecord,
  trashProjectRecord,
  updateProject,
} from "@/lib/project-store";

const PROJECT_STATUSES = new Set(["접수", "심사 진행중", "완료"]);
import type { EvaluationItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const { id } = await params;
  const project = await getProjectById(id);
  if (!project) {
    return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }

  return NextResponse.json({ project });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const { id } = await params;
  const existing = await getProjectById(id);
  if (!existing) {
    return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }

  try {
    const payload = await request.json();
    const patch: Record<string, unknown> = {};

    for (const key of [
      "name",
      "location",
      "client",
      "designer",
      "projectType",
      "scale",
      "reviewType",
      "receivedAt",
      "status",
    ] as const) {
      if (payload[key] !== undefined) {
        patch[key] = String(payload[key]).trim();
      }
    }

    if (payload.summary !== undefined) {
      patch.summary = String(payload.summary).trim() || undefined;
    }

    if (patch.status !== undefined && !PROJECT_STATUSES.has(String(patch.status))) {
      return NextResponse.json({ error: "유효하지 않은 프로젝트 상태입니다." }, { status: 400 });
    }

    if (payload.locationPoint) {
      const locationPoint = payload.locationPoint as {
        x?: unknown;
        y?: unknown;
        source?: unknown;
        note?: unknown;
      };
      const x = Number(locationPoint.x);
      const y = Number(locationPoint.y);
      const source = locationPoint.source;
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return NextResponse.json({ error: "유효한 좌표가 필요합니다." }, { status: 400 });
      }
      if (source !== "address" && source !== "place" && source !== "map") {
        return NextResponse.json({ error: "유효한 위치 source가 필요합니다." }, { status: 400 });
      }
      patch.locationPoint = {
        x,
        y,
        source,
        note: String(locationPoint.note ?? "").trim() || undefined,
      };
    }

    if (payload.savedEvaluationItems !== undefined) {
      if (!Array.isArray(payload.savedEvaluationItems)) {
        return NextResponse.json({ error: "평가항목 형식이 올바르지 않습니다." }, { status: 400 });
      }

      const savedEvaluationItems = (payload.savedEvaluationItems as unknown[])
        .map((item, index) => normalizeSavedEvaluationItem(item, index))
        .filter((item): item is EvaluationItem => item !== null);

      if (savedEvaluationItems.length === 0) {
        return NextResponse.json({ error: "평가항목을 1개 이상 저장해 주세요." }, { status: 400 });
      }

      patch.savedEvaluationItems = savedEvaluationItems;
    }

    const project = await updateProject(id, patch);
    if (!project) {
      return NextResponse.json({ error: "프로젝트를 수정할 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ project });
  } catch {
    return NextResponse.json({ error: "프로젝트 수정 중 오류가 발생했습니다." }, { status: 500 });
  }
}

function normalizeSavedEvaluationItem(item: unknown, index: number): EvaluationItem | null {
  if (!item || typeof item !== "object") return null;

  const row = item as Record<string, unknown>;
  const detailItem = String(row.detailItem ?? "").trim();
  const majorCategory = String(row.majorCategory ?? "").trim();
  const middleCategory = String(row.middleCategory ?? "").trim();
  const criteria = String(row.criteria ?? "").trim();

  if (!detailItem && !majorCategory && !middleCategory && !criteria) {
    return null;
  }

  return {
    id: String(row.id ?? `item-custom-${Date.now()}-${index}`),
    majorCategory,
    middleCategory,
    detailItem: detailItem || "세부 평가항목",
    points: Math.max(0, Number(row.points) || 0),
    description: String(row.description ?? ""),
    criteria,
    lawIds: Array.isArray(row.lawIds) ? row.lawIds.map(String) : [],
    guidelineIds: Array.isArray(row.guidelineIds) ? row.guidelineIds.map(String) : [],
  };
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const { id } = await params;
  const permanent = request.nextUrl.searchParams.get("permanent") === "true";

  if (permanent) {
    const stored = await getStoredProjectRecord(id);

    if (!stored) {
      return NextResponse.json({ ok: true });
    }

    if (!stored.deletedAt) {
      return NextResponse.json({ error: "휴지통에 있는 프로젝트만 영구 삭제할 수 있습니다." }, { status: 400 });
    }

    const purged = await purgeProjectRecord(id);
    if (!purged) {
      return NextResponse.json({ error: "영구 삭제할 프로젝트를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  }

  const existing = await getProjectById(id);
  if (!existing) {
    return NextResponse.json({ error: "삭제할 프로젝트를 찾을 수 없습니다." }, { status: 404 });
  }

  const project = await trashProjectRecord(id);
  if (!project) {
    return NextResponse.json({ error: "프로젝트를 휴지통으로 이동하지 못했습니다." }, { status: 404 });
  }

  return NextResponse.json({ project });
}
