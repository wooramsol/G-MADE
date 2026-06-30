/** 프로덕션 배포 기준 PR 번호. 배포마다 이 값을 갱신합니다. */
export const RELEASE_PR_NUMBER = 55;

export function getReleaseVersionLabel(): string {
  return `PR #${RELEASE_PR_NUMBER}`;
}
