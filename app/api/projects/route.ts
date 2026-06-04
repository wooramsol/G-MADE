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

    const project = await createProject({
      name: String(payload.name).trim(),
      location: String(payload.location).trim(),
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
