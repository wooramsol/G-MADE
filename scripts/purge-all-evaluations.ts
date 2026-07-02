import { purgeAllProjectEvaluationRounds } from "../lib/project-store";

async function main() {
  const { projectsUpdated } = await purgeAllProjectEvaluationRounds();
  console.log(`Purged evaluation rounds from ${projectsUpdated} project(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
