import os from "os";
import path from "path";

const APP_STORAGE_DIR = "g-made-hybrid-evaluation-system";

export function getWritableStoragePath(...segments: string[]): string {
  const basePath = process.env.VERCEL
    ? path.join(os.tmpdir(), APP_STORAGE_DIR)
    : path.join(process.cwd(), "storage");

  return path.join(basePath, ...segments);
}
