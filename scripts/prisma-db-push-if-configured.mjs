import { execSync } from "node:child_process";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  console.log("Skipping prisma db push: DATABASE_URL is not set for this build.");
  process.exit(0);
}

console.log("Running prisma db push...");
execSync("npx prisma db push --skip-generate", { stdio: "inherit" });
