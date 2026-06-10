import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildEvaluationContext } from "@/lib/evaluation-context";
import { addProjectEvaluationRound } from "@/lib/project-store";
import { isFileLike, saveUploadedFiles, toProjectFiles } from "@/lib/save-uploaded-files";
import type { EvaluationItem, EvaluationRound, HumanEvaluationItemScore } from "@/lib/types";
import { analyzeUploadedFiles } from "@/lib/upload-analysis";
import type { AiProviderPreference } from "@/lib/ai/types";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const authSession = await auth();
    if (!authSession?.user) {
      return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    }

    const formData = await request.formData();
    const projectId = String(formData.get("projectId") ?? "").trim();
    const providerPreference = String(formData.get("provider") ?? "gemini") as AiProviderPreference;
    const reviewerName = String(formData.get("reviewerName") ?? "").trim();
    const expertSummary = String(formData.get("expertSummary") ?? "").trim();
    const aiWeight = Number(formData.get("aiWeight") ?? 30);
    const expertWeight = Number(formData.get("expertWeight") ?? 70);
    const evaluationItems = parseEvaluationItems(formData.get("evaluationItems"));
    const expertItemScores = parseExpertItemScores(formData.get("expertItemScores"));

    const aiEntries = formData.getAll("aiFiles");
    const expertEntries = formData.getAll("expertFiles");
    const aiFiles = aiEntries.filter(isFileLike);
    const expertFiles = expertEntries.filter(isFileLike);

    if (!projectId) {
      return NextResponse.json({ error: "프로젝트 ID가 필요합니다." }, { status: 400 });
    }

    if (evaluationItems.length === 0) {
      return NextResponse.json({ error: "평가항목을 1개 이상 등록해 주세요." }, { status: 400 });
    }

    if (aiFiles.length === 0) {
      return NextResponse.json({ error: "AI 평가 자료를 선택해 주세요." }, { status: 400 });
    }

    if (expertFiles.length === 0) {
      return NextResponse.json({ error: "전문가 평가 자료를 선택해 주세요." }, { status: 400 });
    }

    if (!reviewerName) {
      return NextResponse.json({ error: "평가자 이름을 입력해 주세요." }, { status: 400 });
    }

    const savedAiFiles = await saveUploadedFiles(aiFiles);
    const savedExpertFiles = await saveUploadedFiles(expertFiles);
    const evaluatedAt = new Date().toISOString();
    const persistedFiles = toProjectFiles([...savedAiFiles, ...savedExpertFiles], evaluatedAt);

    const { readFile } = await import("fs/promises");
    const { extractDocumentText } = await import("@/lib/document-extract");
    const aiFilesForAnalysis = await Promise.all(
      savedAiFiles.map(async (file) => ({
        ...file,
        extractedTextPreview: await extractDocumentText(
          await readFile(file.storagePath),
          file.originalName,
        ),
      })),
    );

    const evaluationContext = await buildEvaluationContext(projectId);
    const aiAnalysis = await analyzeUploadedFiles({
      providerPreference,
      files: aiFilesForAnalysis,
      evaluationContext,
      evaluationItems,
    });

    const totalPoints = evaluationItems.reduce((sum, item) => sum + item.points, 0);
    const round: EvaluationRound = {
      id: `round-${Date.now()}-${crypto.randomUUID()}`,
      evaluatedAt,
      aiWeight: Number.isFinite(aiWeight) ? aiWeight : 30,
      expertWeight: Number.isFinite(expertWeight) ? expertWeight : 70,
      evaluationItems,
      totalPoints,
      reviewerName,
      expertSummary: expertSummary || undefined,
      aiFiles: savedAiFiles.map(toSessionFile),
      expertFiles: savedExpertFiles.map(toSessionFile),
      aiAnalysis,
      expertItemScores,
    };

    const updatedProject = await addProjectEvaluationRound(projectId, round, persistedFiles);
    if (!updatedProject) {
      return NextResponse.json({ error: "프로젝트를 찾을 수 없습니다." }, { status: 404 });
    }

    return NextResponse.json({ round, project: updatedProject });
  } catch (error) {
    const message = error instanceof Error ? error.message : "하이브리드 평가 분석 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function toSessionFile(file: { id: string; originalName: string; fileType: string; sizeBytes: number }) {
  return {
    id: file.id,
    originalName: file.originalName,
    fileType: file.originalName.split(".").pop()?.toUpperCase() ?? file.fileType,
    sizeBytes: file.sizeBytes,
  };
}

function parseEvaluationItems(value: FormDataEntryValue | null): EvaluationItem[] {
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value) as EvaluationItem[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item.id && item.detailItem).map((item) => ({
          ...item,
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
