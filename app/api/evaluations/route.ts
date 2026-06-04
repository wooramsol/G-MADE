import { NextResponse } from "next/server";
import {
  aiEvaluations,
  evaluationItems,
  hybridResults,
  hybridSettings,
  projects,
} from "@/lib/demo-data";
import { calculateProjectScore } from "@/lib/hybrid-evaluation";

export async function GET() {
  return NextResponse.json({
    project: projects[0],
    settings: hybridSettings,
    evaluationItems,
    aiEvaluations,
    hybridResults,
    projectScore: calculateProjectScore(hybridResults),
  });
}
