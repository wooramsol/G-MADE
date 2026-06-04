import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getWritableStoragePath } from "@/lib/runtime-storage";
import { NextRequest, NextResponse } from "next/server";
import { analyzeUploadedFiles, type UploadedFileSummary } from "@/lib/upload-analysis";

export const runtime = "nodejs";

const allowedExtensions = new Set(["pdf", "docx", "pptx", "jpg", "jpeg", "png", "dwg", "zip", "txt", "md"]);
const maxFileSizeBytes = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const providerPreference = String(formData.get("provider") ?? "auto") as
      | "auto"
      | "demo"
      | "openai"
      | "gemini";
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
        extractedTextPreview: extractTextPreview(buffer, file.type, file.name),
      });
    }

    const analysis = await analyzeUploadedFiles({
      providerPreference,
      files: savedFiles,
    });

    return NextResponse.json({ files: savedFiles, analysis });
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

function extractTextPreview(buffer: Buffer, fileType: string, fileName: string): string {
  const extension = getExtension(fileName);
  const looksText = fileType.startsWith("text/") || ["txt", "md"].includes(extension);

  if (!looksText) {
    return "";
  }

  return buffer.toString("utf8").replace(/\s+/g, " ").slice(0, 4000);
}
