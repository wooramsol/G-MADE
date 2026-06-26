import { analyzeWithClaude } from "./ai/analyze-claude";
import { getGeminiApiKey, getOpenAiApiKey } from "./ai/env-keys";
import { buildAnalysisPrompt } from "./ai/analysis-prompt";
import { AI_EVALUATOR_SYSTEM_PROMPT } from "./ai/evaluator-system-prompt";
import { buildFallbackRecommendation, isGenericRecommendation } from "./ai/fallback-recommendation";
import type { AnalyzeUploadedFilesInput, UploadedFileSummary, UploadAnalysisResult } from "./ai/analysis-types";
import { extractJsonContent } from "./ai/extract-json";
import { formatProviderApiError } from "./ai/format-api-error";
import { DEFAULT_GEMINI_MODEL, getGeminiModelsToTry } from "./ai/gemini-models";
import { selectProvider } from "./ai/select-provider";
import type { EvaluationContext } from "./evaluation-context";
import { evaluationItems as defaultEvaluationItems } from "./demo-data";
import { toStoredReferenceLaws } from "./dedupe-reference-laws";
import { pickRelatedReferenceLaws } from "./related-reference-laws";
import { pickRelatedReferenceGuidelines, toStoredReferenceGuidelines } from "./related-reference-guidelines";
import { fetchWithTimeout } from "./fetch-with-timeout";
import { gradeScore } from "./hybrid-evaluation";
import type { EvaluationItem } from "./types";

export type { UploadedFileSummary, UploadAnalysisResult } from "./ai/analysis-types";

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

export async function analyzeUploadedFiles(input: AnalyzeUploadedFilesInput): Promise<UploadAnalysisResult> {
  const { providerPreference, files, evaluationContext } = input;
  const items = input.evaluationItems?.length ? input.evaluationItems : defaultEvaluationItems;
  const baseWarnings = [...evaluationContext.warnings];

  if (providerPreference === "demo") {
    return createDemoAnalysis(files, evaluationContext, items, "demo", [...baseWarnings, "데모 분석 모드로 실행했습니다."]);
  }

  if (providerPreference === "openai") {
    return analyzeWithOpenAi(files, evaluationContext, items, baseWarnings);
  }

  if (providerPreference === "gemini") {
    return analyzeWithGemini(files, evaluationContext, items, baseWarnings);
  }

  if (providerPreference === "claude") {
    return analyzeWithClaude(files, evaluationContext, items, {
      normalizeAiJson: (content, provider) =>
        normalizeAiJson(content, files, provider, evaluationContext, items, baseWarnings),
      createDemoAnalysis: (provider, warnings) =>
        createDemoAnalysis(files, evaluationContext, items, provider, [...baseWarnings, ...warnings]),
    });
  }

  const provider = selectProvider("auto");

  if (provider === "openai") {
    return analyzeWithOpenAi(files, evaluationContext, items, baseWarnings);
  }

  if (provider === "gemini") {
    return analyzeWithGemini(files, evaluationContext, items, baseWarnings);
  }

  if (provider === "claude") {
    return analyzeWithClaude(files, evaluationContext, items, {
      normalizeAiJson: (content, providerName) =>
        normalizeAiJson(content, files, providerName, evaluationContext, items, baseWarnings),
      createDemoAnalysis: (providerName, warnings) =>
        createDemoAnalysis(files, evaluationContext, items, providerName, [...baseWarnings, ...warnings]),
    });
  }

  return createDemoAnalysis(files, evaluationContext, items, "demo", [
    ...baseWarnings,
    "설정된 AI API 키가 없어 데모 분석 결과를 반환했습니다. Vercel에 GEMINI_API_KEY, OPENAI_API_KEY, CLAUDE_API_KEY 중 하나를 추가해 주세요.",
  ]);
}

async function analyzeWithOpenAi(
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
  items: EvaluationItem[],
  baseWarnings: string[],
): Promise<UploadAnalysisResult> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    return createDemoAnalysis(files, evaluationContext, items, "openai", [
      ...baseWarnings,
      "OPENAI_API_KEY가 Vercel 환경 변수에 설정되지 않았습니다. Settings → Environment Variables에서 추가한 뒤 재배포해 주세요.",
    ]);
  }

  try {
    const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
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
            content: AI_EVALUATOR_SYSTEM_PROMPT,
          },
          {
            role: "user",
            content: buildAnalysisPrompt(files, evaluationContext, items),
          },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const message = await response.text();
      return createDemoAnalysis(files, evaluationContext, items, "openai", [
        ...baseWarnings,
        formatProviderApiError("openai", "OpenAI", response.status, message),
      ]);
    }

    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    return normalizeAiJson(content, files, "openai", evaluationContext, items, baseWarnings);
  } catch (error) {
    return createDemoAnalysis(files, evaluationContext, items, "openai", [
      ...baseWarnings,
      formatProviderTransportError("OpenAI", error),
    ]);
  }
}

async function analyzeWithGemini(
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
  items: EvaluationItem[],
  baseWarnings: string[],
): Promise<UploadAnalysisResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    return createDemoAnalysis(files, evaluationContext, items, "demo", [...baseWarnings, "GEMINI_API_KEY가 설정되지 않았습니다."]);
  }

  const modelsToTry = getGeminiModelsToTry(process.env.GEMINI_MODEL);
  let lastStatus = 500;
  let lastBody = "";
  let rateLimitModel = modelsToTry[0] ?? DEFAULT_GEMINI_MODEL;

  try {
    for (const model of modelsToTry) {
      let response = await requestGemini(apiKey, model, files, evaluationContext, items);

      if (!response.ok && response.status === 429) {
        rateLimitModel = model;
        await sleep(13_000);
        response = await requestGemini(apiKey, model, files, evaluationContext, items);
      }

      if (response.ok) {
        const payload = await response.json();
        const content = payload.candidates?.[0]?.content?.parts?.[0]?.text;
        return normalizeAiJson(content, files, "gemini", evaluationContext, items, baseWarnings);
      }

      lastStatus = response.status;
      lastBody = await response.text();

      if (response.status === 404) {
        continue;
      }

      if (response.status === 429) {
        break;
      }

      break;
    }
  } catch (error) {
    return createDemoAnalysis(files, evaluationContext, items, "gemini", [
      ...baseWarnings,
      formatProviderTransportError("Gemini", error),
    ]);
  }

  if (lastStatus === 429) {
    return createDemoAnalysis(files, evaluationContext, items, "gemini", [
      ...baseWarnings,
      formatProviderApiError("gemini", "Gemini", lastStatus, lastBody),
      `사용 모델: ${rateLimitModel}`,
    ]);
  }

  return createDemoAnalysis(files, evaluationContext, items, "gemini", [
    ...baseWarnings,
    formatProviderApiError("gemini", "Gemini", lastStatus, lastBody),
  ]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestGemini(
  apiKey: string,
  model: string,
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
  items: EvaluationItem[],
) {
  return fetchWithTimeout(
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
                text: `${AI_EVALUATOR_SYSTEM_PROMPT}\n\n${buildAnalysisPrompt(files, evaluationContext, items)}`,
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

function normalizeAiJson(
  content: string | undefined,
  files: UploadedFileSummary[],
  provider: "openai" | "gemini" | "claude",
  evaluationContext: EvaluationContext,
  items: EvaluationItem[],
  baseWarnings: string[],
): UploadAnalysisResult {
  if (!content) {
    return createDemoAnalysis(files, evaluationContext, items, provider, [
      ...baseWarnings,
      `${provider} 응답 본문이 비어 있어 데모 분석으로 대체했습니다.`,
    ]);
  }

  try {
    const parsed = JSON.parse(extractJsonContent(content) ?? content);
      return attachContextMetadata(
      {
        provider,
        mode: "live",
        summary: String(parsed.summary ?? "업로드 자료와 실시간 법령·경관지구 정보를 기반으로 AI 분석을 완료했습니다."),
        documentSections: normalizeSections(parsed.documentSections),
        evaluationPreview: normalizeEvaluations(parsed.evaluationPreview, evaluationContext, items, files),
        warnings: baseWarnings,
      },
      evaluationContext,
      items,
    );
  } catch {
    return createDemoAnalysis(files, evaluationContext, items, provider, [
      ...baseWarnings,
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

function normalizeEvaluations(
  value: unknown,
  evaluationContext: EvaluationContext,
  items: EvaluationItem[],
  files: UploadedFileSummary[] = [],
): UploadAnalysisResult["evaluationPreview"] {
  const source = Array.isArray(value) && value.length > 0 ? value : [];
  const rows = source.length > 0 ? source : items.slice(0, 4);
  const defaultGuidelineRefs = evaluationContext.guidelines.slice(0, 2).map((guide) => `${guide.title} ${guide.section}`);

  return rows.slice(0, Math.max(items.length, 8)).map((row, index) => {
    const item = items[index % items.length];
    const score = clampNumber(Number(row?.score ?? 80 - index * 2));
    const aiLawRefs = Array.isArray(row?.lawRefs)
      ? row.lawRefs.map((law: unknown) => String(law)).filter(Boolean)
      : [];
    const aiGuidelineRefs = Array.isArray(row?.guidelineRefs)
      ? row.guidelineRefs.map((guide: unknown) => String(guide)).filter(Boolean)
      : [];

    return {
      itemId: item.id,
      itemName: String(row?.itemName ?? item.detailItem),
      score,
      grade: String(row?.grade ?? gradeScore(score)),
      rationale: String(row?.rationale ?? buildFallbackRationale(item.criteria, evaluationContext)),
      recommendation: resolveRecommendation(row?.recommendation, item, files, score),
      laws: aiLawRefs,
      guidelines: aiGuidelineRefs.length > 0 ? aiGuidelineRefs : defaultGuidelineRefs,
    };
  });
}

function resolveRecommendation(
  raw: unknown,
  item: EvaluationItem,
  files: UploadedFileSummary[],
  score: number,
): string {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text && !isGenericRecommendation(text)) {
    return text;
  }

  return buildFallbackRecommendation(item, files, score);
}

function buildFallbackRationale(criteria: string, evaluationContext: EvaluationContext): string {
  const lawRef = evaluationContext.referenceLaws[0];
  const spatial = evaluationContext.spatial;
  const parts = [criteria];

  if (lawRef) {
    parts.push(`${lawRef.title} ${lawRef.article} 및 실시간 법령 조회 결과를 참고함.`);
  }
  if (spatial?.matchedZones[0]) {
    parts.push(`인근 경관지구: ${spatial.matchedZones[0].name}.`);
  } else if (spatial) {
    parts.push("경관지구 조회 반경 내 해당 레이어는 확인되지 않음.");
  }

  return parts.join(" ");
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
  evaluationContext: EvaluationContext,
  items: EvaluationItem[],
  provider: "demo" | "openai" | "gemini" | "claude",
  warnings: string[],
): UploadAnalysisResult {
  const fileNames = files.map((file) => file.originalName).join(", ") || "업로드 자료";
  const lawNote =
    evaluationContext.lawSource === "law.go.kr"
      ? `국가법령정보 API에서 ${evaluationContext.referenceLaws.length}건의 법령 근거를 조회했습니다.`
      : "법령 API 미연동 상태에서 내장 요약을 사용했습니다.";
  const guidelineNote =
    evaluationContext.guidelineSource === "law.go.kr"
      ? `행정규칙 API에서 ${evaluationContext.referenceGuidelines.length}건의 지침 근거를 조회했습니다.`
      : "행정규칙 API 미연동 상태에서 내장 지침 요약을 사용했습니다.";
  const spatialNote = evaluationContext.spatial
    ? `경관지구 ${evaluationContext.spatial.inLandscapeZone ? "해당 가능" : "인근 조회 결과 없음"}`
    : "경관지구 정보 미조회";

  return attachContextMetadata(
    {
      provider,
      mode: "demo",
      summary: `${fileNames}를 기준으로 건축개요, 배치, 입면, 색채, 야간경관, 보행동선, 녹지계획을 예비 분석했습니다. ${lawNote} ${guidelineNote} ${spatialNote}.`,
      documentSections: defaultSections(),
      evaluationPreview: normalizeEvaluations([], evaluationContext, items, files),
      warnings,
    },
    evaluationContext,
    items,
  );
}

function attachContextMetadata(
  result: Omit<
    UploadAnalysisResult,
    "referenceLaws" | "referenceGuidelines" | "spatialContext" | "lawSource" | "guidelineSource" | "contextFetchedAt"
  >,
  evaluationContext: EvaluationContext,
  evaluationItems?: EvaluationItem[],
): UploadAnalysisResult {
  const relatedLaws = pickRelatedReferenceLaws({
    pool: evaluationContext.referenceLaws,
    evaluationPreview: result.evaluationPreview,
    evaluationItems,
  });
  const relatedGuidelines = pickRelatedReferenceGuidelines({
    pool: evaluationContext.referenceGuidelines,
    evaluationPreview: result.evaluationPreview,
    evaluationItems,
  });

  return {
    ...result,
    referenceLaws: toStoredReferenceLaws(mapStoredReferenceLaws(relatedLaws)),
    referenceGuidelines: toStoredReferenceGuidelines(mapStoredReferenceGuidelines(relatedGuidelines)),
    spatialContext: evaluationContext.spatial,
    lawSource: evaluationContext.lawSource,
    guidelineSource: evaluationContext.guidelineSource,
    contextFetchedAt: evaluationContext.fetchedAt,
  };
}

function mapStoredReferenceLaws(
  laws: Array<{ title: string; article: string; summary: string; sourceUrl: string }>,
) {
  return laws
    .filter((law) => law.sourceUrl)
    .map((law) => ({
      title: law.title,
      article: law.article,
      summary: law.summary,
      sourceUrl: law.sourceUrl,
    }));
}

function mapStoredReferenceGuidelines(
  guidelines: Array<{ title: string; section: string; summary: string; sourceUrl: string }>,
) {
  return guidelines
    .filter((guide) => guide.sourceUrl)
    .map((guide) => ({
      title: guide.title,
      section: guide.section,
      summary: guide.summary,
      sourceUrl: guide.sourceUrl,
    }));
}

function clampNumber(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function formatProviderTransportError(providerLabel: string, error: unknown): string {
  const message = error instanceof Error ? error.message : "알 수 없는 오류";
  if (message.includes("초과")) {
    return `대용량 자료 분석 중 ${providerLabel} 응답이 지연되어 중단되었습니다(${message}). 파일을 나누거나 다시 시도해 주세요.`;
  }

  return `${providerLabel} API 호출 중 오류: ${message}`;
}
