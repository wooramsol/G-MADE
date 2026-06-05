import { formatProviderApiError } from "./ai/format-api-error";
import { selectProvider } from "./ai/select-provider";
import type { AiProviderPreference } from "./ai/types";
import { evaluationItems, guidelines, laws } from "./demo-data";
import { gradeScore } from "./hybrid-evaluation";

export type UploadedFileSummary = {
  id: string;
  originalName: string;
  fileType: string;
  sizeBytes: number;
  storagePath: string;
  extractedTextPreview: string;
};

export type UploadAnalysisResult = {
  provider: "demo" | "openai" | "gemini" | "claude";
  mode: "demo" | "live";
  summary: string;
  documentSections: Array<{
    label: string;
    confidence: number;
    summary: string;
  }>;
  evaluationPreview: Array<{
    itemId: string;
    itemName: string;
    score: number;
    grade: string;
    rationale: string;
    recommendation: string;
    laws: string[];
    guidelines: string[];
  }>;
  warnings: string[];
};

type AnalyzeInput = {
  providerPreference: AiProviderPreference;
  files: UploadedFileSummary[];
};

const sectionLabels = [
  "건축개요",
  "배치도",
  "입면도",
  "조감도",
  "색채계획",
  "야간경관",
  "보행동선",
  "녹지계획",
  "공공공간",
  "주변현황",
];

export async function analyzeUploadedFiles(input: AnalyzeInput): Promise<UploadAnalysisResult> {
  const provider = selectProvider(input.providerPreference);

  if (provider === "openai") {
    return analyzeWithOpenAi(input.files);
  }

  if (provider === "gemini") {
    return analyzeWithGemini(input.files);
  }

  if (provider === "claude") {
    return analyzeWithClaude(input.files);
  }

  return createDemoAnalysis(input.files, "demo", [
    "API 키가 설정되지 않아 데모 AI 분석 결과를 반환했습니다.",
  ]);
}

async function analyzeWithClaude(files: UploadedFileSummary[]): Promise<UploadAnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return createDemoAnalysis(files, "demo", ["ANTHROPIC_API_KEY가 설정되지 않았습니다."]);
  }

  return createDemoAnalysis(files, "claude", [
    "Claude API 연동은 준비 중입니다. 테스트 단계에서는 Gemini를 기본으로 사용합니다.",
  ]);
}

async function analyzeWithOpenAi(files: UploadedFileSummary[]): Promise<UploadAnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return createDemoAnalysis(files, "demo", ["OPENAI_API_KEY가 설정되지 않았습니다."]);

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "너는 G-MADE Hybrid Evaluation System의 경관사전심의 AI 평가 보조자다. 최종 결정권자는 인간 심사위원이라는 원칙을 지키고, 반드시 JSON만 반환한다.",
        },
        {
          role: "user",
          content: buildPrompt(files),
        },
      ],
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    return createDemoAnalysis(files, "openai", [formatProviderApiError("OpenAI", response.status, message)]);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  return normalizeAiJson(content, files, "openai");
}

async function analyzeWithGemini(files: UploadedFileSummary[]): Promise<UploadAnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return createDemoAnalysis(files, "demo", ["GEMINI_API_KEY가 설정되지 않았습니다."]);

  const configuredModel = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const modelsToTry = Array.from(new Set([configuredModel, "gemini-2.0-flash", "gemini-2.0-flash-lite"]));

  let lastStatus = 500;
  let lastBody = "";

  for (const model of modelsToTry) {
    const response = await requestGemini(apiKey, model, files);

    if (response.ok) {
      const payload = await response.json();
      const content = payload.candidates?.[0]?.content?.parts?.[0]?.text;
      return normalizeAiJson(content, files, "gemini");
    }

    lastStatus = response.status;
    lastBody = await response.text();

    // 429는 분당 요청 제한(RPM) — 연속 재시도하면 오히려 한도를 더 소모함
    if (response.status === 429) {
      break;
    }

    // 404(모델 없음)일 때만 다음 모델로 한 번 교체
    if (response.status !== 404) {
      break;
    }
  }

  return createDemoAnalysis(files, "gemini", [formatProviderApiError("Gemini", lastStatus, lastBody)]);
}

async function requestGemini(apiKey: string, model: string, files: UploadedFileSummary[]) {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `너는 G-MADE Hybrid Evaluation System의 경관사전심의 AI 평가 보조자다. 최종 결정권자는 인간 심사위원이라는 원칙을 지키고, 반드시 JSON만 반환한다.\n\n${buildPrompt(files)}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    },
  );
}

function buildPrompt(files: UploadedFileSummary[]): string {
  return `업로드된 심의 자료를 분석해라.

파일 목록:
${files
  .map(
    (file, index) =>
      `${index + 1}. ${file.originalName} (${file.fileType}, ${file.sizeBytes} bytes)\n텍스트 미리보기: ${file.extractedTextPreview || "텍스트 추출 불가 또는 이미지/도면 자료"}`,
  )
  .join("\n\n")}

반환 JSON 스키마:
{
  "summary": "전체 분석 요약",
  "documentSections": [{ "label": "건축개요", "confidence": 0-100, "summary": "추출 요약" }],
  "evaluationPreview": [{
    "itemName": "평가항목명",
    "score": 0-100,
    "grade": "매우우수|우수|보통|미흡|매우미흡",
    "rationale": "점수 산정 근거",
    "recommendation": "개선권고사항"
  }]
}

평가항목 후보:
${evaluationItems.map((item) => `- ${item.detailItem}: ${item.criteria}`).join("\n")}

관련 법령 후보:
${laws.map((law) => `- ${law.title} ${law.article}: ${law.summary}`).join("\n")}

관련 지침 후보:
${guidelines.map((guide) => `- ${guide.title} ${guide.section}: ${guide.summary}`).join("\n")}`;
}

function normalizeAiJson(
  content: string | undefined,
  files: UploadedFileSummary[],
  provider: "openai" | "gemini" | "claude",
): UploadAnalysisResult {
  if (!content) {
    return createDemoAnalysis(files, provider, [`${provider} 응답 본문이 비어 있어 데모 분석으로 대체했습니다.`]);
  }

  try {
    const parsed = JSON.parse(content);
    return {
      provider,
      mode: "live",
      summary: String(parsed.summary ?? "업로드 자료를 기반으로 AI 분석을 완료했습니다."),
      documentSections: normalizeSections(parsed.documentSections),
      evaluationPreview: normalizeEvaluations(parsed.evaluationPreview),
      warnings: [],
    };
  } catch {
    return createDemoAnalysis(files, provider, [
      `${provider} 응답 JSON 파싱에 실패해 원문 요약을 표시합니다: ${content.slice(0, 300)}`,
    ]);
  }
}

function normalizeSections(value: unknown): UploadAnalysisResult["documentSections"] {
  if (!Array.isArray(value)) return defaultSections();

  return value.slice(0, 10).map((section, index) => ({
    label: String(section?.label ?? sectionLabels[index] ?? "분석항목"),
    confidence: clampNumber(Number(section?.confidence ?? 75)),
    summary: String(section?.summary ?? "AI가 해당 자료를 분석했습니다."),
  }));
}

function normalizeEvaluations(value: unknown): UploadAnalysisResult["evaluationPreview"] {
  const source = Array.isArray(value) && value.length > 0 ? value : [];
  const rows = source.length > 0 ? source : evaluationItems.slice(0, 4);

  return rows.slice(0, 8).map((row, index) => {
    const item = evaluationItems[index % evaluationItems.length];
    const score = clampNumber(Number(row?.score ?? 80 - index * 2));
    return {
      itemId: item.id,
      itemName: String(row?.itemName ?? item.detailItem),
      score,
      grade: String(row?.grade ?? gradeScore(score)),
      rationale: String(row?.rationale ?? item.criteria),
      recommendation: String(row?.recommendation ?? "심사위원 검토 단계에서 현장 맥락과 보완 조건을 확인해야 합니다."),
      laws: laws.slice(0, 2).map((law) => `${law.title} ${law.article}`),
      guidelines: guidelines.slice(0, 2).map((guide) => `${guide.title} ${guide.section}`),
    };
  });
}

function defaultSections(): UploadAnalysisResult["documentSections"] {
  return sectionLabels.map((label, index) => ({
    label,
    confidence: [92, 88, 84, 78, 82, 74, 90, 80, 86, 89][index] ?? 80,
    summary: `${label} 항목을 업로드 자료에서 확인하고 심의 평가에 필요한 정보를 추출했습니다.`,
  }));
}

function createDemoAnalysis(
  files: UploadedFileSummary[],
  provider: "demo" | "openai" | "gemini" | "claude",
  warnings: string[],
): UploadAnalysisResult {
  const fileNames = files.map((file) => file.originalName).join(", ") || "업로드 자료";

  return {
    provider,
    mode: "demo",
    summary: `${fileNames}를 기준으로 건축개요, 배치, 입면, 색채, 야간경관, 보행동선, 녹지계획을 예비 분석했습니다. 실제 AI API 키가 설정되면 같은 화면에서 실시간 분석 결과가 표시됩니다.`,
    documentSections: defaultSections(),
    evaluationPreview: normalizeEvaluations([]),
    warnings,
  };
}

function clampNumber(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
