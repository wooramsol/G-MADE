import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { createProject, getAllProjects } from "@/lib/project-store";
import { revalidateProjectViews } from "@/lib/revalidate-project-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  const projects = await getAllProjects();
  return NextResponse.json({ projects });
}

export async function POST(request: NextRequest) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  try {
    const payload = await request.json();
    const requiredFields = ["name", "location", "client", "designer", "projectType", "reviewType", "receivedAt"];

    for (const field of requiredFields) {
      if (!String(payload[field] ?? "").trim()) {
        return NextResponse.json({ error: `${field} 값을 입력해 주세요.` }, { status: 400 });
      }
    }

    const locationPoint = payload.locationPoint as
      | { x?: unknown; y?: unknown; source?: unknown; note?: unknown; adminRegion?: unknown }
      | undefined;
    const x = Number(locationPoint?.x);
    const y = Number(locationPoint?.y);
    const source = locationPoint?.source;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return NextResponse.json(
        { error: "사업위치를 검색하거나 지도에서 선택해 주세요." },
        { status: 400 },
      );
    }

    if (source !== "address" && source !== "place" && source !== "map") {
      return NextResponse.json({ error: "유효한 위치 선택 정보가 필요합니다." }, { status: 400 });
    }

    const project = await createProject({
      name: String(payload.name).trim(),
      location: String(payload.location).trim(),
      locationPoint: {
        x,
        y,
        source,
        note: String(locationPoint?.note ?? "").trim() || undefined,
        adminRegion: String(locationPoint?.adminRegion ?? "").trim() || undefined,
      },
      client: String(payload.client).trim(),
      designer: String(payload.designer).trim(),
      projectType: String(payload.projectType).trim(),
      scale: String(payload.scale).trim(),
      reviewType: String(payload.reviewType).trim(),
      receivedAt: String(payload.receivedAt).trim(),
      summary: String(payload.summary ?? "").trim() || undefined,
    });

    revalidateProjectViews(project.id);
    return NextResponse.json({ project }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "프로젝트 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
