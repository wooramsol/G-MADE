/** PR 머지 배포 시 갱신하는 fallback PR 번호. */
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

function resolveCommitShort(): string | null {
  const sha = process.env.NEXT_PUBLIC_RELEASE_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "";
  return sha ? sha.slice(0, 7) : null;
}

/**
 * 배포 버전 라벨. 배포마다 값이 바뀌어 반영 여부를 확인할 수 있다.
 * - PR 머지 배포: "PR #N · abc1234"
 * - 직접 푸시 배포: "abc1234" (커밋 short SHA)
 * - 로컬/SHA 없음: "PR #N (fallback)"
 */
export function getReleaseVersionLabel(): string {
  const short = resolveCommitShort();
  const fromCommit = extractPrNumber(process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "");

  if (fromCommit && short) return `PR #${fromCommit} · ${short}`;
  if (short) return short;
  return `PR #${resolveReleasePrNumber()}`;
}
