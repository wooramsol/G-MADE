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

  return "82";
}

const nextConfig: NextConfig = {
  typedRoutes: true,
  env: {
    NEXT_PUBLIC_RELEASE_PR: resolveBuildReleasePr(),
  },
};

export default nextConfig;
