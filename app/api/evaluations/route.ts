import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import {
  aiEvaluations,
  evaluationItems,
  hybridResults,
  hybridSettings,
  projects,
} from "@/lib/demo-data";
import { calculateProjectScore } from "@/lib/hybrid-evaluation";

export async function GET() {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  return NextResponse.json({
    project: projects[0],
    settings: hybridSettings,
    evaluationItems,
    aiEvaluations,
    hybridResults,
    projectScore: calculateProjectScore(hybridResults),
  });
}
