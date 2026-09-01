import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { getPostgresRuntimeUrl } from "./postgres-env";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaPool?: Pool;
};

function createPrismaClient(): PrismaClient {
  const connectionString = getPostgresRuntimeUrl();
  if (!connectionString) {
    throw new Error("Postgres connection string is not configured");
  }

  // 서버리스에서는 인스턴스가 수십 개까지 늘어나므로 인스턴스당 연결을 작게 유지해야
  // 합산이 DB 연결 한도를 넘지 않는다 (기본 max=10이 캡처 썸네일 버스트 때
  // "too many connections"를 유발한 실측 사례).
  const pool =
    globalForPrisma.prismaPool ??
    new Pool({
      connectionString,
      max: 2,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  globalForPrisma.prismaPool = pool;

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export function getPrismaClient(): PrismaClient | null {
  if (!getPostgresRuntimeUrl()) return null;

  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }

  return globalForPrisma.prisma;
}

export async function isDatabaseAvailable(): Promise<boolean> {
  const client = getPrismaClient();
  if (!client) return false;

  try {
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
