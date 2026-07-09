/** PR마다 갱신하는 fallback PR 번호. fast-forward 배포 시 헤더 배지에 사용된다. */
export const RELEASE_PR_NUMBER = 104;

function extractPrNumber(text: string): number | null {
  const match = text.match(/#(\d+)/);
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function resolveReleasePrNumber(): number {
  const fromCommit = extractPrNumber(process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "");
  if (fromCommit) return fromCommit;

  const fromBuild = Number(process.env.NEXT_PUBLIC_RELEASE_PR);
  if (Number.isFinite(fromBuild) && fromBuild > 0) return fromBuild;

  return RELEASE_PR_NUMBER;
}

/**
 * 배포 버전 라벨. 우선순위:
 * 1. Vercel 커밋 메시지의 PR 번호 (Merge pull request #N)
 * 2. 빌드 시 주입된 NEXT_PUBLIC_RELEASE_PR
 * 3. RELEASE_PR_NUMBER 상수
 */
export function getReleaseVersionLabel(): string {
  return `PR #${resolveReleasePrNumber()}`;
}
