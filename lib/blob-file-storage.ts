import { del, get, head, put } from "@vercel/blob";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { getBlobAccess, isBlobStorageConfigured } from "./blob-config";
import { isR2Configured, r2DeleteObject, r2GetObject, r2PutObject } from "./r2-storage";
import { getWritableStoragePath } from "./runtime-storage";
import {
  buildProjectBlobPathname,
  formatStoredFileType,
  inferUploadContentType,
  validateUploadMetadata,
} from "./upload-validation";

export type PersistedUploadFile = {
  id: string;
  originalName: string;
  fileType: string;
  sizeBytes: number;
  storageKey: string;
  blobUrl?: string;
  /** 로컬 개발용 디스크 경로 (Blob 미사용 시) */
  storagePath?: string;
};

export function isBlobStorageEnabled(): boolean {
  return isR2Configured() || isBlobStorageConfigured();
}

export async function uploadBufferToProjectBlob(
  projectId: string,
  fileName: string,
  buffer: Buffer,
  contentType?: string,
): Promise<PersistedUploadFile> {
  validateUploadMetadata(fileName, buffer.byteLength);

  const id = `${Date.now()}-${crypto.randomUUID()}`;
  const pathname = buildProjectBlobPathname(projectId, id, fileName);

  if (isR2Configured()) {
    await r2PutObject(pathname, buffer, inferUploadContentType(fileName, contentType));
    return {
      id,
      originalName: fileName,
      fileType: formatStoredFileType(fileName, contentType ?? ""),
      sizeBytes: buffer.byteLength,
      storageKey: pathname,
    };
  }

  if (isBlobStorageEnabled()) {
    const blob = await put(pathname, buffer, {
      access: getBlobAccess(),
      contentType: inferUploadContentType(fileName, contentType),
      addRandomSuffix: false,
    });

    return {
      id,
      originalName: fileName,
      fileType: formatStoredFileType(fileName, contentType ?? ""),
      sizeBytes: buffer.byteLength,
      storageKey: blob.pathname,
      blobUrl: blob.url,
    };
  }

  const uploadDir = getWritableStoragePath("uploads");
  await mkdir(uploadDir, { recursive: true });
  const storedName = `${id}-${fileName.replace(/[^a-zA-Z0-9가-힣._-]/g, "_")}`;
  const storagePath = path.join(uploadDir, storedName);
  await writeFile(storagePath, buffer);

  return {
    id,
    originalName: fileName,
    fileType: formatStoredFileType(fileName, contentType ?? ""),
    sizeBytes: buffer.byteLength,
    storageKey: pathname,
    storagePath,
  };
}

export async function readPersistedUploadFile(file: PersistedUploadFile): Promise<Buffer> {
  if (file.storagePath) {
    return readFile(file.storagePath);
  }

  if (!isBlobStorageEnabled()) {
    throw new Error("파일 저장소를 사용할 수 없습니다. Vercel Blob 스토어 연결을 확인해 주세요.");
  }

  const attemptsR2: string[] = [];
  // R2 우선 — 새로 저장되는 파일은 모두 여기 있다.
  if (isR2Configured()) {
    try {
      const bytes = await r2GetObject(file.storageKey);
      if (bytes) return bytes;
      attemptsR2.push("r2 미존재");
    } catch (error) {
      attemptsR2.push(`r2 오류: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ---- 이하 Vercel Blob 레거시(이전 파일) 읽기 폴백 ----
  // private blob은 인증된 get()으로 읽는다. 스토어/blob 접근 모드 불일치
  // ("Cannot use ... access on a ... store")면 반대 모드로 재시도한다.
  const getAttempts: string[] = [...attemptsR2];
  if (!isBlobStorageConfigured()) {
    // Vercel Blob 토큰이 없으면 업로드 당시 기록된 공개 URL만 시도 가능
    if (file.blobUrl) {
      const response = await fetch(file.blobUrl);
      if (response.ok) return Buffer.from(await response.arrayBuffer());
      getAttempts.push(`blobUrl ${response.status}`);
    }
    console.error(
      `[blob] 파일 읽기 실패 key=${file.storageKey} name=${file.originalName} 시도=[${getAttempts.join(", ")}]`,
    );
    throw new Error(`저장된 파일을 불러오지 못했습니다: ${file.originalName}`);
  }
  const primaryAccess = getBlobAccess();
  const accessModes: ("public" | "private")[] =
    primaryAccess === "private" ? ["private", "public"] : ["public", "private"];
  for (const access of accessModes) {
    try {
      const result = await get(file.storageKey, { access });
      if (result?.stream) {
        return Buffer.from(await new Response(result.stream).arrayBuffer());
      }
      getAttempts.push(`get(${access}) 빈 응답`);
    } catch (error) {
      getAttempts.push(`get(${access}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // head의 downloadUrl을 우선 사용하고, 비공개 blob(직접 접근 403)은 스토어 토큰을
  // Authorization 헤더에 실어 재시도합니다 — 비공개 저장 파일의 확실한 읽기 경로.
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  const fetchBlob = async (url: string): Promise<Buffer | number> => {
    const plain = await fetch(url);
    if (plain.ok) return Buffer.from(await plain.arrayBuffer());
    if ((plain.status === 401 || plain.status === 403) && token) {
      const authed = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
      if (authed.ok) return Buffer.from(await authed.arrayBuffer());
      return authed.status;
    }
    return plain.status;
  };

  const attempts: string[] = [...getAttempts];
  try {
    const metadata = await head(file.storageKey);
    attempts.push(`head-url=${metadata.downloadUrl ?? metadata.url ?? "(없음)"}`);
    for (const url of [metadata.downloadUrl, metadata.url]) {
      if (!url) continue;
      const result = await fetchBlob(url);
      if (Buffer.isBuffer(result)) return result;
      attempts.push(`head-url ${result}`);
    }
  } catch (error) {
    attempts.push(`head 실패: ${error instanceof Error ? error.message : String(error)}`);
  }

  // 업로드 당시 기록된 원본 URL — 저장소 설정이 바뀐 과거 파일의 최종 폴백
  if (file.blobUrl) {
    const result = await fetchBlob(file.blobUrl);
    if (Buffer.isBuffer(result)) return result;
    attempts.push(`blobUrl ${result}`);
  }

  console.error(
    `[blob] 파일 읽기 실패 key=${file.storageKey} name=${file.originalName} 시도=[${attempts.join(", ")}]`,
  );
  throw new Error(`저장된 파일을 불러오지 못했습니다: ${file.originalName}`);
}

export async function deletePersistedUploadFiles(files: PersistedUploadFile[]): Promise<void> {
  await Promise.all(
    files.map(async (file) => {
      if (file.storagePath) {
        await unlink(file.storagePath).catch(() => undefined);
        return;
      }

      if (isR2Configured()) {
        await r2DeleteObject(file.storageKey).catch(() => undefined);
      }
      if (isBlobStorageConfigured()) {
        await del(file.storageKey).catch(() => undefined);
      }
    }),
  );
}
