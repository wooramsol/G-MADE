import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { runEvaluationRound } from "@/lib/run-evaluation-round";
import { resolveAiProviderPreference } from "@/lib/resolve-ai-provider-preference";
import { isFileLike } from "@/lib/save-uploaded-files";
import type { EvaluationItem, HumanEvaluationItemScore, Project } from "@/lib/types";
import type { AiProviderPreference } from "@/lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 120;
export const preferredRegion = "icn1";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  try {
    const formData = await request.formData();
    const wantsStream = String(formData.get("stream") ?? "") === "1";

    const input = {
      projectId: String(formData.get("projectId") ?? "").trim(),
      providerPreference: resolveAiProviderPreference(
        String(formData.get("provider") ?? ""),
      ) as AiProviderPreference,
      reviewerName: String(formData.get("reviewerName") ?? "").trim(),
      expertSummary: String(formData.get("expertSummary") ?? "").trim(),
      aiWeight: Number(formData.get("aiWeight") ?? 30),
      expertWeight: Number(formData.get("expertWeight") ?? 70),
      evaluationItems: parseEvaluationItems(formData.get("evaluationItems")),
      manualExpertScores: parseExpertItemScores(formData.get("expertItemScores")),
      aiFiles: formData.getAll("aiFiles").filter(isFileLike),
      expertFiles: formData.getAll("expertFiles").filter(isFileLike),
      projectSnapshot: parseProjectSnapshot(formData.get("projectSnapshot")),
    };

    if (wantsStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const write = (payload: unknown) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
          };

          try {
            const result = await runEvaluationRound(input, (progress) => write(progress));
            write({
              type: "complete",
              round: result.round,
              project: result.project,
              analysisMode: result.analysisMode,
              warnings: result.warnings,
            });
          } catch (error) {
            write({
              type: "error",
              error: error instanceof Error ? error.message : "하이브리드 평가 분석 중 오류가 발생했습니다.",
            });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const result = await runEvaluationRound(input);
    return NextResponse.json({
      round: result.round,
      project: result.project,
      analysisMode: result.analysisMode,
      warnings: result.warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "하이브리드 평가 분석 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseProjectSnapshot(value: FormDataEntryValue | null): Project | null {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const parsed = JSON.parse(value) as Project;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

function parseEvaluationItems(value: FormDataEntryValue | null): EvaluationItem[] {
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value) as EvaluationItem[];
    return Array.isArray(parsed)
      ? parsed
          .filter((item) => item.id)
          .map((item) => ({
            ...item,
            majorCategory: String(item.majorCategory ?? "").trim() || "미분류",
            middleCategory: String(item.middleCategory ?? "").trim() || "미분류",
            detailItem: String(item.detailItem ?? "").trim() || "평가항목",
            criteria: String(item.criteria ?? "").trim() || "평가 기준 미입력",
            points: Math.max(0, Number(item.points) || 0),
          }))
      : [];
  } catch {
    return [];
  }
}

function parseExpertItemScores(value: FormDataEntryValue | null): HumanEvaluationItemScore[] {
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value) as HumanEvaluationItemScore[];
    return Array.isArray(parsed)
      ? parsed.map((row) => ({
          itemId: row.itemId,
          score: Math.max(0, Math.min(100, Number(row.score) || 0)),
          comment: row.comment?.trim() || undefined,
        }))
      : [];
  } catch {
    return [];
  }
}
