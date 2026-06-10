import { readServerEnv } from "./server-env";

/** App runtime (pooled connection preferred). */
export function getPostgresRuntimeUrl(): string | undefined {
  return (
    readServerEnv("POSTGRES_PRISMA_URL") ??
    readServerEnv("DATABASE_URL") ??
    readServerEnv("POSTGRES_URL")
  );
}

/** Schema sync / prisma db push (direct connection preferred). */
export function getPostgresDirectUrl(): string | undefined {
  return (
    readServerEnv("POSTGRES_URL_NON_POOLING") ??
    readServerEnv("DATABASE_URL_UNPOOLED") ??
    readServerEnv("DATABASE_URL") ??
    readServerEnv("POSTGRES_URL")
  );
}

export function isPostgresConfigured(): boolean {
  return Boolean(getPostgresRuntimeUrl() || getPostgresDirectUrl());
}
