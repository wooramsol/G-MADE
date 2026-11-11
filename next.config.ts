import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

function resolveBuildReleasePr(): string {
  const commitMessage = process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "";
  const fromCommit = commitMessage.match(/#(\d+)/)?.[1];
  if (fromCommit) return fromCommit;

  try {
    const source = readFileSync(join(process.cwd(), "lib/release-version.ts"), "utf8");
    const fromSource = source.match(/RELEASE_PR_NUMBER\s*=\s*(\d+)/)?.[1];
    if (fromSource) return fromSource;
  } catch {
    // ignore
  }

  return "104";
}

const nextConfig: NextConfig = {
  typedRoutes: true,
  // 네이티브 모듈은 번들링에서 제외 (선별 줌의 PDF 페이지 렌더링용)
  serverExternalPackages: ["@napi-rs/canvas"],
  // Vercel 람다(linux x64)에 네이티브 바이너리가 파일 추적에서 누락돼
  // "@napi-rs/canvas is not available" 오류가 났음 — 분석 라우트에 강제 포함.
  outputFileTracingIncludes: {
    "/api/checklist-reviews": [
      "./node_modules/@napi-rs/canvas/**",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**",
      "./node_modules/pdfjs-dist/wasm/**",
      "./node_modules/pdfjs-dist/standard_fonts/**",
    ],
    "/api/checklist-reviews/evidence-snippet": [
      "./node_modules/@napi-rs/canvas/**",
      "./node_modules/@napi-rs/canvas-linux-x64-gnu/**",
      "./node_modules/pdfjs-dist/wasm/**",
      "./node_modules/pdfjs-dist/standard_fonts/**",
    ],
  },
  // 기본 보안 헤더 — 다른 사이트에 끼워 넣기(클릭재킹) 차단, 파일 형식 추측 차단, HTTPS 고정 등
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_RELEASE_PR: resolveBuildReleasePr(),
    NEXT_PUBLIC_RELEASE_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
  },
};

export default nextConfig;
