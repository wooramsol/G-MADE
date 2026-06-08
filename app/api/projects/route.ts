import { NextRequest, NextResponse } from "next/server";
import { createProject, getAllProjects } from "@/lib/project-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const projects = await getAllProjects();
  return NextResponse.json({ projects });
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const requiredFields = ["name", "location", "client", "designer", "projectType", "scale", "reviewType", "receivedAt"];

    for (const field of requiredFields) {
      if (!String(payload[field] ?? "").trim()) {
        return NextResponse.json({ error: `${field} 값을 입력해 주세요.` }, { status: 400 });
      }
    }

    const locationPoint = payload.locationPoint as
      | { x?: unknown; y?: unknown; source?: unknown; note?: unknown }
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
      },
      client: String(payload.client).trim(),
      designer: String(payload.designer).trim(),
      projectType: String(payload.projectType).trim(),
      scale: String(payload.scale).trim(),
      reviewType: String(payload.reviewType).trim(),
      receivedAt: String(payload.receivedAt).trim(),
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "프로젝트 생성 중 오류가 발생했습니다." }, { status: 500 });
  }
}
