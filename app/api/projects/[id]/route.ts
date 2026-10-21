import { NextRequest, NextResponse } from "next/server";
import { requireApiRole } from "@/lib/api-auth";
import { requireProjectAccess } from "@/lib/project-access";
import { canEditProjectInfo } from "@/lib/roles";
import { collectProjectStoredFiles } from "@/lib/project-file-pool";
import {
  getProjectById,
  getProjectRecordById,
  isDemoProjectId,
  purgeProjectRecord,
  trashProjectRecord,
  updateProject,
} from "@/lib/project-store";
import { revalidateProjectViews } from "@/lib/revalidate-project-paths";
import { deleteSavedUploadFiles, storedRefsToSavedFiles } from "@/lib/save-uploaded-files";
import { isProjectTrashed } from "@/lib/trash";

const PROJECT_STATUSES = new Set(["접수", "심사 진행중", "완료"]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.response) return access.response;
  return NextResponse.json({ project: access.project });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (access.response) return access.response;

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

    // 지원자는 도서 접수 전까지만 기본정보 수정 가능 (접수 후에는 공무원만)
    if (!canEditProjectInfo(access.session.user, access.project)) {
      return NextResponse.json({ error: "도서 접수 후에는 담당 공무원만 기본정보를 수정할 수 있습니다." }, { status: 403 });
    }
    // 상태·접수일은 공무원만
    if (!access.official) {
      delete patch.status;
      delete patch.receivedAt;
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
        adminRegion?: unknown;
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
        adminRegion: String(locationPoint.adminRegion ?? "").trim() || undefined,
      };
    }


    const project = await updateProject(id, patch);
    if (!project) {
      return NextResponse.json({ error: "프로젝트를 수정할 수 없습니다." }, { status: 404 });
    }

    revalidateProjectViews(id);
    return NextResponse.json({ project });
  } catch {
    return NextResponse.json({ error: "프로젝트 수정 중 오류가 발생했습니다." }, { status: 500 });
  }
}


export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // 삭제(휴지통 이동 포함)는 공무원만
  const access = await requireProjectAccess(id, { officialOnly: true });
  if (access.response) return access.response;
  const permanent = request.nextUrl.searchParams.get("permanent") === "true";

  if (permanent) {
    // 영구 삭제는 관리자·공무원만 수행할 수 있다.
    const roleResult = await requireApiRole("ADMIN", "OFFICER");
    if (roleResult.response) return roleResult.response;

    const record = await getProjectRecordById(id);

    if (!record) {
      return NextResponse.json({ error: "영구 삭제할 프로젝트를 찾을 수 없습니다." }, { status: 404 });
    }

    if (!isProjectTrashed(record)) {
      return NextResponse.json({ error: "휴지통에 있는 프로젝트만 영구 삭제할 수 있습니다." }, { status: 400 });
    }

    const purged = await purgeProjectRecord(id);
    if (!purged) {
      return NextResponse.json({ error: "영구 삭제할 프로젝트를 찾을 수 없습니다." }, { status: 404 });
    }

    // 고아 Blob 방지: 프로젝트에 연결된 업로드 파일을 함께 삭제한다.
    // (데모 프로젝트는 원본 데모 파일 메타를 포함할 수 있어 제외)
    if (!isDemoProjectId(id)) {
      const storedFiles = collectProjectStoredFiles(record);
      await deleteSavedUploadFiles(storedRefsToSavedFiles(storedFiles)).catch(() => undefined);
    }

    revalidateProjectViews(id);
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

  revalidateProjectViews(id);
  return NextResponse.json({ project });
}
