import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getWritableStoragePath } from "@/lib/runtime-storage";
import { NextRequest, NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { extractDocumentText } from "@/lib/document-extract";
import { getDefaultAiProvider } from "@/lib/ai/select-provider";
import type { AiProviderPreference } from "@/lib/ai/types";
import { buildEvaluationContext } from "@/lib/evaluation-context";
import { addProjectUploadAnalysis } from "@/lib/project-store";
import { analyzeUploadedFiles, type UploadedFileSummary } from "@/lib/upload-analysis";
import type { ProjectFile, UploadAnalysisSession } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;
export const preferredRegion = "icn1";

const allowedExtensions = new Set(["pdf", "docx", "pptx", "jpg", "jpeg", "png", "dwg", "zip", "txt", "md"]);
const maxFileSizeBytes = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireApiSession();
    if (authResult.response) return authResult.response;

    const formData = await request.formData();
    const projectId = String(formData.get("projectId") ?? "").trim();
    const providerPreference = String(formData.get("provider") ?? getDefaultAiProvider()) as AiProviderPreference;
    const entries = formData.getAll("files");
    const files = entries.filter(isFileLike);

    if (files.length === 0) {
      return NextResponse.json({ error: "업로드할 파일을 선택해 주세요." }, { status: 400 });
    }

    const uploadDir = getWritableStoragePath("uploads");
    await mkdir(uploadDir, { recursive: true });

    const savedFiles: UploadedFileSummary[] = [];

    for (const file of files) {
      validateFile(file);

      const buffer = Buffer.from(await file.arrayBuffer());
      const id = `${Date.now()}-${crypto.randomUUID()}`;
      const safeName = sanitizeFileName(file.name);
      const storedName = `${id}-${safeName}`;
      const storagePath = path.join(uploadDir, storedName);
      await writeFile(storagePath, buffer);

      savedFiles.push({
        id,
        originalName: file.name,
        fileType: file.type || inferFileType(file.name),
        sizeBytes: file.size,
        storagePath,
        extractedTextPreview: await extractDocumentText(buffer, file.name),
      });
    }

    const uploadedAt = new Date().toISOString();
    const persistedFiles: ProjectFile[] = savedFiles.map((file) => ({
      id: file.id,
      fileName: file.originalName,
      fileType: formatStoredFileType(file.originalName, file.fileType),
      analysisStatus: "완료",
      uploadedAt,
      sizeBytes: file.sizeBytes,
    }));

    const evaluationContext = await buildEvaluationContext(projectId || undefined);
    const analysis = await analyzeUploadedFiles({
      providerPreference,
      files: savedFiles,
      evaluationContext,
    });

    const aiWeight = Number(formData.get("aiWeight") ?? 30);
    const expertWeight = Number(formData.get("expertWeight") ?? 70);
    const evaluationItemPoints = parseEvaluationItemPoints(formData.get("evaluationItemPoints"));
    const totalPoints = Object.values(evaluationItemPoints).reduce((sum, points) => sum + points, 0);

    const session: UploadAnalysisSession = {
      id: `analysis-${Date.now()}-${crypto.randomUUID()}`,
      analyzedAt: uploadedAt,
      aiWeight: Number.isFinite(aiWeight) ? aiWeight : 30,
      expertWeight: Number.isFinite(expertWeight) ? expertWeight : 70,
      totalPoints,
      files: savedFiles.map((file) => ({
        id: file.id,
        originalName: file.originalName,
        fileType: formatStoredFileType(file.originalName, file.fileType),
        sizeBytes: file.sizeBytes,
      })),
      analysis,
    };

    const updatedProject = projectId
      ? await addProjectUploadAnalysis(projectId, session, persistedFiles)
      : undefined;

    return NextResponse.json({ files: savedFiles, analysis, session, project: updatedProject });
  } catch (error) {
    const message = error instanceof Error ? error.message : "파일 업로드 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function isFileLike(value: FormDataEntryValue): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && "name" in value;
}

function validateFile(file: File) {
  const extension = getExtension(file.name);

  if (!allowedExtensions.has(extension)) {
    throw new Error(`지원하지 않는 파일 형식입니다: ${file.name}`);
  }

  if (file.size > maxFileSizeBytes) {
    throw new Error(`파일 용량은 25MB 이하만 지원합니다: ${file.name}`);
  }
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9가-힣._-]/g, "_");
}

function getExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function inferFileType(fileName: string): string {
  const extension = getExtension(fileName);
  return extension ? `application/${extension}` : "application/octet-stream";
}

function formatStoredFileType(fileName: string, fallbackType: string): string {
  const extension = getExtension(fileName);
  return extension ? extension.toUpperCase() : fallbackType;
}

function parseEvaluationItemPoints(value: FormDataEntryValue | null): Record<string, number> {
  if (typeof value !== "string" || !value.trim()) return {};

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, points]) => [key, Math.max(0, Number(points) || 0)]),
    );
  } catch {
    return {};
  }
}
