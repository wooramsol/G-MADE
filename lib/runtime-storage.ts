import os from "os";
import path from "path";

const APP_STORAGE_DIR = "g-made-hybrid-evaluation-system";

/** Vercel에서는 /tmp 경로를 사용합니다. 재배포·콜드스타트 시 서버 파일이 사라질 수 있으므로 브라우저 localStorage 동기화가 필수입니다. */
export function getWritableStoragePath(...segments: string[]): string {
  const basePath = process.env.VERCEL
    ? path.join(os.tmpdir(), APP_STORAGE_DIR)
    : path.join(process.cwd(), "storage");

  return path.join(basePath, ...segments);
}
