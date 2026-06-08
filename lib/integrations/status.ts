import { getConfiguredProviders } from "../ai/env-keys";
import { getDefaultAiProvider, isProviderConfigured } from "../ai/select-provider";
import { getLawReferer, isLawApiConfigured } from "../law/config";
import { isDatabaseAvailable } from "../prisma";
import { readServerEnv, readServerEnvHint } from "../server-env";
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
  const providers = getConfiguredProviders();
  const defaultProvider = getDefaultAiProvider();
  const anyAiConfigured = providers.gemini || providers.openai || providers.claude;
  const lawConfigured = isLawApiConfigured();
  const spatialConfigured = isVWorldConfigured();
  const databaseConfigured = await isDatabaseAvailable();

  const aiRows: IntegrationRow[] = [
    {
      id: "ai-gemini",
      name: "Google Gemini",
      provider: "Google AI",
      configured: providers.gemini,
      envKeys: ["GEMINI_API_KEY"],
      detail: providers.geminiKeyHint ? `키 확인: ${providers.geminiKeyHint}` : undefined,
      fallback: "미설정 시 다른 AI 또는 데모 분석 사용",
      ...rowStatus(providers.gemini),
    },
    {
      id: "ai-openai",
      name: "OpenAI ChatGPT",
      provider: "OpenAI",
      configured: providers.openai,
      envKeys: ["OPENAI_API_KEY"],
      detail: providers.openaiKeyHint ? `키 확인: ${providers.openaiKeyHint}` : undefined,
      fallback: "미설정 시 다른 AI 또는 데모 분석 사용",
      ...rowStatus(providers.openai),
    },
    {
      id: "ai-claude",
      name: "Anthropic Claude",
      provider: "Anthropic",
      configured: providers.claude,
      envKeys: providers.claudeEnvKey
        ? [providers.claudeEnvKey]
        : ["CLAUDE_API_KEY", "ANTHROPIC_API_KEY"],
      detail: providers.claudeKeyHint ? `키 확인: ${providers.claudeKeyHint}` : undefined,
      fallback: "미설정 시 다른 AI 또는 데모 분석 사용",
      ...rowStatus(providers.claude),
    },
    {
      id: "ai-demo",
      name: "G-MADE HIVE 데모 분석",
      provider: "내장",
      configured: true,
      statusLabel: anyAiConfigured ? "대체 사용" : "기본 사용",
      tone: anyAiConfigured ? "fallback" : "active",
      detail: `기본 제공자: ${defaultProvider}`,
      fallback: "AI API 키가 없을 때 자동 사용",
    },
    {
      id: "ai-default",
      name: "현재 자동 선택",
      provider: "시스템",
      configured: defaultProvider !== "demo" && isProviderConfigured(defaultProvider),
      statusLabel:
        defaultProvider !== "demo" && isProviderConfigured(defaultProvider)
          ? `${defaultProvider} 사용`
          : "데모 분석",
      tone: defaultProvider !== "demo" && isProviderConfigured(defaultProvider) ? "active" : "fallback",
      envKeys: ["AI_PROVIDER_DEFAULT"],
      detail: `AI_PROVIDER_DEFAULT=${defaultProvider}`,
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
        ? `OC 확인: ${readServerEnvHint("LAW_OC", 6) ?? readServerEnvHint("LAW_API_KEY", 6) ?? "설정됨"} · Referer ${getLawReferer()}`
        : undefined,
      fallback: "미설정 시 내장 법령 요약 사용",
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
      envKeys: ["DATABASE_URL"],
      detail: databaseConfigured
        ? "사용자·역할 등 DB 연동 사용 중"
        : readServerEnv("DATABASE_URL")
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
        description: "업로드 문서 분석에 사용하는 AI 제공자입니다.",
        rows: aiRows,
      },
      {
        id: "law",
        title: "법령 API 연동 상태",
        description: "실시간 법령 검색·조문 조회에 사용합니다.",
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
        description: "계정·역할 등 영구 저장에 사용합니다.",
        rows: databaseRows,
      },
    ],
    checkedAt: new Date().toISOString(),
  };
}
