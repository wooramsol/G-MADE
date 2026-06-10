import { execSync } from "node:child_process";

function pickEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

function withSslIfNeeded(url) {
  if (/[?&](sslmode|ssl)=/i.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}sslmode=require`;
}

const directUrl = pickEnv(
  "POSTGRES_URL_NON_POOLING",
  "DATABASE_URL_UNPOOLED",
  "DATABASE_URL",
  "POSTGRES_URL",
);

if (!directUrl) {
  console.log("Skipping prisma db push: no Postgres connection string is set for this build.");
  process.exit(0);
}

const pushUrl = withSslIfNeeded(directUrl);

console.log("Running prisma db push with direct Postgres URL...");
try {
  execSync("npx prisma db push --skip-generate", {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: pushUrl,
    },
  });
} catch (error) {
  console.error("prisma db push failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
