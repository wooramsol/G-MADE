#!/usr/bin/env node
/**
 * Build and push current HEAD to the Vercel production branch.
 * Usage: node scripts/deploy-production.mjs
 */
import { execSync } from "node:child_process";

const PRODUCTION_BRANCH = "cursor/g-made-hybrid-evaluation-0398";

function run(command) {
  console.log(`> ${command}`);
  execSync(command, { stdio: "inherit" });
}

run("npm run build");
run(`git push origin HEAD:${PRODUCTION_BRANCH}`);
console.log(`\nPushed to ${PRODUCTION_BRANCH}. Vercel will deploy automatically.`);
