#!/usr/bin/env node
/**
 * Build and push current HEAD to the Vercel production branch (main).
 * Usage: node scripts/deploy-production.mjs
 *
 * Prefer merging the PR on GitHub so the commit message contains
 * "Merge pull request #N" for the global header release badge.
 */
import { execSync } from "node:child_process";

const PRODUCTION_BRANCH = "main";

function run(command) {
  console.log(`> ${command}`);
  execSync(command, { stdio: "inherit" });
}

run("npm run build");
run(`git push origin HEAD:${PRODUCTION_BRANCH}`);
console.log(`\nPushed to ${PRODUCTION_BRANCH}. Vercel will deploy automatically.`);
