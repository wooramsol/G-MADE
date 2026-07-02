/** Vercel 환경 변수를 읽지 못할 때 사용하는 fallback PR 번호. */
export const RELEASE_PR_NUMBER = 70;

/**
 * 배포 버전 라벨. Vercel 배포 커밋 메시지("Merge pull request #N ...")에서
 * PR 번호를 자동 추출하므로 배포마다 수동 갱신이 필요 없다.
 */
export function getReleaseVersionLabel(): string {
  const message = process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "";
  const prMatch = message.match(/#(\d+)/);
  if (prMatch) return `PR #${prMatch[1]}`;

  const sha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (sha) return sha.slice(0, 7);

  return `PR #${RELEASE_PR_NUMBER}`;
}
