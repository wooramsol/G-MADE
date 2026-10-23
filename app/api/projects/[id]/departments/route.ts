import { NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/project-access";
import { setProjectDepartments } from "@/lib/project-store";
import { revalidateProjectViews } from "@/lib/revalidate-project-paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 사전검토 — 유관부서 할당 (부서 이름 태그) */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id, { officialOnly: true });
  if (access.response) return access.response;
  const body = (await request.json().catch(() => null)) as { departments?: unknown } | null;
  if (!Array.isArray(body?.departments)) return NextResponse.json({ error: "부서 목록이 필요합니다." }, { status: 400 });
  const seen = new Set<string>();
  const departments: string[] = [];
  for (const raw of body.departments.slice(0, 30)) {
    const name = String(raw ?? "").trim().slice(0, 40);
    const key = name.replace(/\s+/g, "");
    if (!name || seen.has(key)) continue;
    seen.add(key);
    departments.push(name);
  }
  const updated = await setProjectDepartments(id, departments);
  if (!updated) return NextResponse.json({ error: "저장하지 못했습니다." }, { status: 500 });
  revalidateProjectViews(id);
  return NextResponse.json({ departments: updated.departments ?? [] });
}
