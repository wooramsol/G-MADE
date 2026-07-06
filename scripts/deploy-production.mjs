#!/usr/bin/env node
/**
 * Build and push current HEAD to the Vercel production branch (main).
 * Usage: node scripts/deploy-production.mjs [pr-number]
 *
 * Prefer merging the PR on GitHub so the commit message contains
 * "Merge pull request #N" for the global header release badge.
 * When fast-forwarding, pass the PR number so release-version.ts stays accurate.
 */
import { execSync } from "node:child_process";

const PRODUCTION_BRANCH = "main";
const prNumber = process.argv[2];

function run(command) {
  console.log(`> ${command}`);
  execSync(command, { stdio: "inherit" });
}

if (prNumber && !/^\d+$/.test(prNumber)) {
  console.error("PR number must be digits only, e.g. node scripts/deploy-production.mjs 76");
  process.exit(1);
}

run("npm run build");
run(`git push origin HEAD:${PRODUCTION_BRANCH}`);
console.log(`\nPushed to ${PRODUCTION_BRANCH}. Vercel will deploy automatically.`);
if (prNumber) {
  console.log(`Release badge should show PR #${prNumber} via RELEASE_PR_NUMBER in lib/release-version.ts.`);
}
