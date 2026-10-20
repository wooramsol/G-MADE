import { NextResponse } from "next/server";
import { requireOfficial } from "@/lib/project-access";
import { getTrashedProjects } from "@/lib/project-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const authResult = await requireOfficial();
  if (authResult.response) return authResult.response;

  const projects = await getTrashedProjects();
  return NextResponse.json({ projects });
}
