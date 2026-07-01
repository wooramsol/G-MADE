import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { revalidateProjectViews } from "@/lib/revalidate-project-paths";
import { runEvaluationRound } from "@/lib/run-evaluation-round";
import {
  EVALUATION_SERVER_DEADLINE_MESSAGE,
  EVALUATION_SERVER_DEADLINE_MS,
} from "@/lib/evaluation-stream-messages";
import { resolveAiProviderPreference } from "@/lib/resolve-ai-provider-preference";
import { isFileLike } from "@/lib/save-uploaded-files";
import type { StoredFileRef } from "@/lib/stored-file-ref";
import type { EvaluationItem, HumanEvaluationItemScore, Project } from "@/lib/types";
import { DEFAULT_AI_WEIGHT, DEFAULT_EXPERT_WEIGHT } from "@/lib/evaluation-weight-requirements";
import type { AiProviderPreference } from "@/lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 300;
export const preferredRegion = "icn1";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const authResult = await requireApiSession();
  if (authResult.response) return authResult.response;

  try {
    const formData = await request.formData();
    const wantsStream = String(formData.get("stream") ?? "") === "1";

    const fileRefs = resolveEvaluationFileRefs(formData);
    const files = resolveEvaluationFiles(formData);

    const input = {
      projectId: String(formData.get("projectId") ?? "").trim(),
      providerPreference: resolveAiProviderPreference(
        String(formData.get("provider") ?? ""),
      ) as AiProviderPreference,
      reviewerName: String(formData.get("reviewerName") ?? "").trim(),
      expertSummary: String(formData.get("expertSummary") ?? "").trim(),
      aiWeight: Number(formData.get("aiWeight") ?? DEFAULT_AI_WEIGHT),
      expertWeight: Number(formData.get("expertWeight") ?? DEFAULT_EXPERT_WEIGHT),
      evaluationItems: parseEvaluationItems(formData.get("evaluationItems")),
      manualExpertScores: parseExpertItemScores(formData.get("expertItemScores")),
      fileRefs,
      files,
      projectSnapshot: parseProjectSnapshot(formData.get("projectSnapshot")),
    };

    if (wantsStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const write = (payload: unknown) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
          };

          const heartbeat = setInterval(() => {
            write({ type: "heartbeat", at: Date.now() });
          }, 12_000);

          try {
            const result = await Promise.race([
              runEvaluationRound(input, (progress) => write(progress)),
              new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error(EVALUATION_SERVER_DEADLINE_MESSAGE)), EVALUATION_SERVER_DEADLINE_MS);
              }),
            ]);
            write({
              type: "complete",
              round: result.round,
              project: result.project,
              analysisMode: result.analysisMode,
              warnings: result.warnings,
            });
            try {
              revalidateProjectViews(input.projectId);
            } catch {
              // 완료 응답 이후 캐시 갱신 실패는 분석 결과에 영향 없음
            }
          } catch (error) {
            write({
              type: "error",
              error: error instanceof Error ? error.message : "하이브리드 평가 분석 중 오류가 발생했습니다.",
            });
          } finally {
            clearInterval(heartbeat);
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
    revalidateProjectViews(input.projectId);
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

function parseStoredFileRefs(value: FormDataEntryValue | null): StoredFileRef[] {
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value) as StoredFileRef[];
    return Array.isArray(parsed)
      ? parsed
          .filter((ref) => ref.id && ref.storageKey && ref.originalName)
          .map((ref) => ({
            id: String(ref.id),
            originalName: String(ref.originalName),
            fileType: String(ref.fileType ?? ""),
            sizeBytes: Math.max(0, Number(ref.sizeBytes) || 0),
            storageKey: String(ref.storageKey),
            blobUrl: ref.blobUrl ? String(ref.blobUrl) : undefined,
            uploadedAt: ref.uploadedAt ? String(ref.uploadedAt) : undefined,
          }))
      : [];
  } catch {
    return [];
  }
}

function resolveEvaluationFileRefs(formData: FormData): StoredFileRef[] {
  const unified = parseStoredFileRefs(formData.get("fileRefs"));
  if (unified.length > 0) return unified;

  const byId = new Map<string, StoredFileRef>();
  for (const ref of [
    ...parseStoredFileRefs(formData.get("aiFileRefs")),
    ...parseStoredFileRefs(formData.get("expertFileRefs")),
  ]) {
    byId.set(ref.id, ref);
  }
  return Array.from(byId.values());
}

function resolveEvaluationFiles(formData: FormData): File[] {
  const unified = formData.getAll("files").filter(isFileLike);
  if (unified.length > 0) return unified;

  const bySignature = new Map<string, File>();
  for (const file of [
    ...formData.getAll("aiFiles").filter(isFileLike),
    ...formData.getAll("expertFiles").filter(isFileLike),
  ]) {
    bySignature.set(`${file.name}:${file.size}:${file.lastModified}`, file);
  }
  return Array.from(bySignature.values());
}
