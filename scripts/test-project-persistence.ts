/**
 * DB 기반 프로젝트 저장소 통합 테스트 (수동 실행용).
 * DATABASE_URL을 지정하면 Postgres 경로를, 지정하지 않으면 파일 경로를 검증한다.
 *
 * 실행: DATABASE_URL=... npx tsx scripts/test-project-persistence.ts
 */
import assert from "node:assert";
import {
  createProject,
  getProjectById,
  getStoredProjectRecord,
  purgeProjectRecord,
  trashProjectRecord,
  restoreProjectRecord,
  updateProject,
  addProjectEvaluationRound,
} from "../lib/project-store";
import type { EvaluationRound } from "../lib/types";

async function main() {
  console.log("DATABASE_URL:", process.env.DATABASE_URL ? "(set)" : "(not set — file mode)");

  const project = await createProject({
    name: "영속성 테스트 프로젝트",
    location: "서울특별시 중구 세종대로 175",
    client: "테스트",
    designer: "테스트",
    projectType: "공공건축",
    scale: "연면적 1,000㎡",
    reviewType: "경관심의",
    receivedAt: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString(),
  });
  console.log("created:", project.id);

  const fetched = await getProjectById(project.id);
  assert(fetched, "생성한 프로젝트를 조회할 수 있어야 한다");
  assert.equal(fetched!.name, "영속성 테스트 프로젝트");

  const updated = await updateProject(project.id, { name: "수정된 이름" });
  assert.equal(updated?.name, "수정된 이름");

  const round: EvaluationRound = {
    id: `round-test-${Date.now()}`,
    evaluatedAt: new Date().toISOString(),
    aiWeight: 30,
    expertWeight: 70,
    evaluationItems: [],
    totalPoints: 0,
    reviewerName: "테스트",
    aiFiles: [],
    expertFiles: [],
    aiAnalysis: {
      provider: "demo",
      mode: "demo",
      summary: "테스트",
      documentSections: [],
      evaluationPreview: [],
      warnings: [],
    },
    expertItemScores: [],
  };
  const withRound = await addProjectEvaluationRound(project.id, round, []);
  assert.equal(withRound?.evaluationRounds?.length, 1, "평가 차수가 저장되어야 한다");

  const reFetched = await getProjectById(project.id);
  assert.equal(reFetched?.evaluationRounds?.length, 1, "재조회 시 평가 차수가 유지되어야 한다");

  const trashed = await trashProjectRecord(project.id);
  assert(trashed?.deletedAt, "휴지통 이동 시 deletedAt이 설정되어야 한다");
  assert(!(await getProjectById(project.id)), "휴지통 프로젝트는 일반 조회에서 제외되어야 한다");

  const restored = await restoreProjectRecord(project.id);
  assert(!restored?.deletedAt, "복원 시 deletedAt이 제거되어야 한다");

  await trashProjectRecord(project.id);
  const purged = await purgeProjectRecord(project.id);
  assert.equal(purged, true, "영구 삭제가 성공해야 한다");
  assert(!(await getStoredProjectRecord(project.id)), "영구 삭제 후 레코드가 없어야 한다");

  console.log("✅ project persistence integration test passed");
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error("❌", error);
    process.exit(1);
  },
);
