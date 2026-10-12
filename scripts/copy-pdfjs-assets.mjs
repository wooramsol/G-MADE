// 전문가 분석 PDF 뷰어(브라우저 pdf.js)용 워커·폰트·wasm을 public/pdfjs로 복사한다.
// 패키지 버전과 워커 버전이 항상 일치하도록 빌드 때마다 복사 (git에는 올리지 않음).
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const src = join(root, "node_modules", "pdfjs-dist");
const dest = join(root, "public", "pdfjs");

if (!existsSync(src)) {
  console.warn("[pdfjs] node_modules/pdfjs-dist 없음 — 복사 건너뜀");
  process.exit(0);
}
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(join(src, "build", "pdf.worker.min.mjs"), join(dest, "pdf.worker.min.mjs"));
for (const dir of ["cmaps", "standard_fonts", "wasm"]) {
  if (existsSync(join(src, dir))) cpSync(join(src, dir), join(dest, dir), { recursive: true });
}
console.log("[pdfjs] public/pdfjs 준비 완료");
