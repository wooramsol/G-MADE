import { del, get, head, put } from "@vercel/blob";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import path from "path";
import { getBlobAccess, isBlobStorageConfigured } from "./blob-config";
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
  return isBlobStorageConfigured();
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

  // private blob은 인증된 get()으로 읽는다. 과거 public으로 업로드된 blob은
  // get(access) 불일치로 실패할 수 있으므로 head+fetch로 한 번 더 시도한다.
  try {
    const result = await get(file.storageKey, { access: getBlobAccess() });
    if (result?.stream) {
      return Buffer.from(await new Response(result.stream).arrayBuffer());
    }
  } catch {
    // Fall through to public URL fetch.
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

  const attempts: string[] = [];
  try {
    const metadata = await head(file.storageKey);
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

      if (isBlobStorageEnabled()) {
        await del(file.storageKey).catch(() => undefined);
      }
    }),
  );
}
