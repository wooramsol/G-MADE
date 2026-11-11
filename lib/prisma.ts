import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
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
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 10_000,
    });
  if (!globalForPrisma.prismaPool) {
    // 함수 인스턴스가 멈추기(suspend) 전에 쉬는 연결을 닫게 한다 — 멈춘 인스턴스가 연결을 붙든 채 남아
    // DB 연결 한도를 넘기던 문제(리포트 화면의 썸네일 수십 개 동시 요청 뒤 "too many connections") 방지
    try {
      attachDatabasePool(pool);
    } catch {
      // Vercel 밖(로컬·테스트)에서는 무시
    }
  }
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
