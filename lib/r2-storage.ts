import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 저장소 (S3 호환 API).
 *
 * Vercel Blob에서 이전한 이유: 이 앱은 대용량 심의도서 PDF를 반복해서 읽는데,
 * R2는 다운로드 전송료가 없어 전송량 한도(요금) 걱정 없이 운영할 수 있다.
 * R2_* 환경변수 4개가 모두 설정되면 저장소 계층이 R2를 우선 사용한다.
 * (기존 Vercel Blob에 저장된 과거 파일은 읽기 폴백으로 계속 접근 가능)
 */

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID?.trim() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim() &&
      process.env.R2_BUCKET?.trim(),
  );
}

let cachedClient: S3Client | null = null;

function getR2Client(): S3Client {
  if (cachedClient) return cachedClient;
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID?.trim() ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY?.trim() ?? "",
    },
  });
  return cachedClient;
}

function getBucket(): string {
  return process.env.R2_BUCKET?.trim() ?? "";
}

export async function r2PutObject(key: string, body: Buffer | Uint8Array, contentType?: string): Promise<void> {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** 객체를 읽어 Buffer로 반환. 존재하지 않으면 null. */
export async function r2GetObject(key: string): Promise<Buffer | null> {
  try {
    const result = await getR2Client().send(new GetObjectCommand({ Bucket: getBucket(), Key: key }));
    if (!result.Body) return null;
    const bytes = await result.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function r2HeadObject(key: string): Promise<boolean> {
  try {
    await getR2Client().send(new HeadObjectCommand({ Bucket: getBucket(), Key: key }));
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

export async function r2DeleteObject(key: string): Promise<void> {
  await getR2Client().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}

/**
 * 브라우저 직접 업로드용 presigned PUT URL.
 * ContentLength·ContentType을 서명에 포함해 선언한 크기·형식 그대로만 업로드 가능.
 */
export async function r2PresignPutUrl(
  key: string,
  contentType: string,
  contentLength: number,
  expiresInSeconds = 3600,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
    ContentLength: contentLength,
  });
  return getSignedUrl(getR2Client(), command, { expiresIn: expiresInSeconds });
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: string }).name ?? "";
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return name === "NoSuchKey" || name === "NotFound" || status === 404;
}
