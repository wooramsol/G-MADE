import { getClaudeStatus } from "../ai/env-keys";

import { getLawReferer, isLawApiConfigured } from "../law/config";
import { isPostgresConfigured } from "../postgres-env";
import { isProjectStoragePersistent } from "../project-db-persistence";
import { isDatabaseAvailable } from "../prisma";
import { getVWorldDomain, isVWorldConfigured } from "../vworld/config";

export type IntegrationTone = "active" | "inactive" | "fallback";

export type IntegrationRow = {
  id: string;
  name: string;
  provider: string;
  configured: boolean;
  statusLabel: string;
  tone: IntegrationTone;
  detail?: string;
  envKeys?: string[];
  fallback?: string;
};

export type IntegrationGroup = {
  id: string;
  title: string;
  description: string;
  rows: IntegrationRow[];
};

export type IntegrationStatusSnapshot = {
  groups: IntegrationGroup[];
  checkedAt: string;
};

function rowStatus(configured: boolean, fallback?: string): Pick<IntegrationRow, "statusLabel" | "tone"> {
  if (configured) return { statusLabel: "연동됨", tone: "active" };
  if (fallback) return { statusLabel: "대체 사용", tone: "fallback" };
  return { statusLabel: "미연동", tone: "inactive" };
}

export async function getIntegrationStatuses(): Promise<IntegrationStatusSnapshot> {
  const claude = getClaudeStatus();
  const lawConfigured = isLawApiConfigured();
  const spatialConfigured = isVWorldConfigured();
  const databaseConfigured = await isDatabaseAvailable();
  const projectStoragePersistent = await isProjectStoragePersistent();

  const aiRows: IntegrationRow[] = [
    {
      id: "ai-claude",
      name: "Anthropic Claude",
      provider: "Anthropic",
      configured: claude.configured,
      envKeys: claude.envKey ? [claude.envKey] : ["CLAUDE_API_KEY", "ANTHROPIC_API_KEY"],
      detail: claude.configured ? "키 설정됨 · 체크리스트 추출·항목 평가에 사용" : undefined,
      fallback: "미설정 시 AI 검토 비활성",
      ...rowStatus(claude.configured),
    },
  ];

  const lawRows: IntegrationRow[] = [
    {
      id: "law-go-kr",
      name: "국가법령정보센터",
      provider: "law.go.kr",
      configured: lawConfigured,
      envKeys: ["LAW_OC", "LAW_API_KEY"],
      detail: lawConfigured
        ? `OC 설정됨 · Referer ${getLawReferer()} · 법령·자치법규·행정규칙·별표`
        : undefined,
      fallback: "미설정 시 내장 법령·지침 요약 사용",
      ...rowStatus(lawConfigured, "내장 법령 요약"),
    },
  ];

  const spatialRows: IntegrationRow[] = [
    {
      id: "spatial-vworld",
      name: "브이월드 공간정보",
      provider: "VWorld",
      configured: spatialConfigured,
      envKeys: ["VWORLD_API_KEY", "VWORLD_DOMAIN"],
      detail: spatialConfigured
        ? `도메인 ${getVWorldDomain()} · 경관지구·지오코딩·주소검색`
        : undefined,
      fallback: "미설정 시 경관지구·주소 연동 비활성",
      ...rowStatus(spatialConfigured),
    },
  ];

  const databaseRows: IntegrationRow[] = [
    {
      id: "database-postgres",
      name: "PostgreSQL",
      provider: "Prisma",
      configured: databaseConfigured,
      envKeys: ["DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL"],
      detail: databaseConfigured
        ? projectStoragePersistent
          ? "계정·로그인 기록 + 프로젝트·평가 데이터 영속 저장"
          : "계정·로그인 기록용 (managed_projects 테이블 없음 — prisma db push 필요)"
        : isPostgresConfigured()
          ? "연결 문자열은 있으나 DB 응답 없음"
          : undefined,
      fallback: "미설정 시 데모 데이터·로컬 저장 사용",
      ...rowStatus(databaseConfigured, "데모·로컬 저장"),
    },
  ];

  return {
    groups: [
      {
        id: "ai",
        title: "AI 연동 상태",
        description: "체크리스트 추출과 항목별 평가에 사용하는 AI입니다.",
        rows: aiRows,
      },
      {
        id: "law",
        title: "법령 API 연동 상태",
        description: "실시간 법령·자치법규·행정규칙·별표 조회에 사용합니다.",
        rows: lawRows,
      },
      {
        id: "spatial",
        title: "공간정보 API 연동 상태",
        description: "경관지구 조회, 주소 검색, 지도 레이어에 사용합니다.",
        rows: spatialRows,
      },
      {
        id: "database",
        title: "데이터베이스 연동 상태",
        description:
          "계정·역할·로그인 기록과 프로젝트·평가 데이터 영속 저장에 사용합니다. 미연결 시 프로젝트 데이터는 서버 임시 JSON과 브라우저 저장소에만 남습니다.",
        rows: databaseRows,
      },
    ],
    checkedAt: new Date().toISOString(),
  };
}
