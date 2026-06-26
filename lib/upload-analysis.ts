import { analyzeWithClaude } from "./ai/analyze-claude";
import { AiAnalysisError } from "./ai/analysis-error";
import { getGeminiApiKey, getGeminiModel, getOpenAiApiKey } from "./ai/env-keys";
import { buildAnalysisPrompt } from "./ai/analysis-prompt";
import { AI_EVALUATOR_SYSTEM_PROMPT } from "./ai/evaluator-system-prompt";
import { buildFallbackRecommendation, isGenericRecommendation } from "./ai/fallback-recommendation";
import type { AnalyzeUploadedFilesInput, UploadedFileSummary, UploadAnalysisResult } from "./ai/analysis-types";
import { extractJsonContent } from "./ai/extract-json";
import { formatProviderApiError } from "./ai/format-api-error";
import { DEFAULT_GEMINI_MODEL, getGeminiModelsToTry } from "./ai/gemini-models";
import { requestGeminiGenerateContent } from "./ai/gemini-request";
import { isProviderConfigured, selectProvider } from "./ai/select-provider";
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

  if (providerPreference === "openai") {
    ensureProviderConfigured("openai");
    return analyzeWithOpenAi(files, evaluationContext, items, baseWarnings);
  }

  if (providerPreference === "gemini") {
    ensureProviderConfigured("gemini");
    return analyzeWithGemini(files, evaluationContext, items, baseWarnings);
  }

  if (providerPreference === "claude") {
    ensureProviderConfigured("claude");
    return analyzeWithClaude(files, evaluationContext, items, {
      normalizeAiJson: (content) =>
        normalizeAiJson(content, files, "claude", evaluationContext, items, baseWarnings),
    });
  }

  const provider = selectProvider("auto");
  if (!provider) {
    throw new AiAnalysisError(
      "AI API 키가 설정되지 않았습니다. Vercel Production 환경에 GEMINI_API_KEY, OPENAI_API_KEY, CLAUDE_API_KEY 중 하나를 추가한 뒤 Redeploy 해 주세요.",
    );
  }

  if (provider === "openai") {
    return analyzeWithOpenAi(files, evaluationContext, items, baseWarnings);
  }

  if (provider === "gemini") {
    return analyzeWithGemini(files, evaluationContext, items, baseWarnings);
  }

  return analyzeWithClaude(files, evaluationContext, items, {
    normalizeAiJson: (content) =>
      normalizeAiJson(content, files, "claude", evaluationContext, items, baseWarnings),
  });
}

function ensureProviderConfigured(provider: "openai" | "gemini" | "claude") {
  if (isProviderConfigured(provider)) return;

  const envKeys = {
    openai: "OPENAI_API_KEY",
    gemini: "GEMINI_API_KEY",
    claude: "CLAUDE_API_KEY",
  } as const;

  throw new AiAnalysisError(
    `${envKeys[provider]}가 서버에 설정되지 않았습니다. Vercel Environment Variables에서 Production 환경에 키를 추가한 뒤 Redeploy 해 주세요.`,
    provider,
  );
}

async function analyzeWithOpenAi(
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
  items: EvaluationItem[],
  baseWarnings: string[],
): Promise<UploadAnalysisResult> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new AiAnalysisError(
      "OPENAI_API_KEY가 Vercel 환경 변수에 설정되지 않았습니다. Settings → Environment Variables에서 추가한 뒤 재배포해 주세요.",
      "openai",
    );
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
      throw new AiAnalysisError(formatProviderApiError("openai", "OpenAI", response.status, message), "openai");
    }

    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    return normalizeAiJson(content, files, "openai", evaluationContext, items, baseWarnings);
  } catch (error) {
    if (error instanceof AiAnalysisError) throw error;
    throw new AiAnalysisError(formatProviderTransportError("OpenAI", error), "openai");
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
    throw new AiAnalysisError("GEMINI_API_KEY가 설정되지 않았습니다.", "gemini");
  }

  const modelsToTry = getGeminiModelsToTry(getGeminiModel());
  let lastStatus = 500;
  let lastBody = "";

  try {
    for (const model of modelsToTry) {
      let response = await requestGemini(apiKey, model, files, evaluationContext, items);

      if (!response.ok && response.status === 429) {
        await sleep(13_000);
        response = await requestGemini(apiKey, model, files, evaluationContext, items);
      }

      if (response.ok) {
        const payload = await response.json();
        const blockReason = payload.promptFeedback?.blockReason;
        if (blockReason) {
          throw new AiAnalysisError(
            `Gemini가 자료 분석 응답을 차단했습니다(${blockReason}). 자료 내용을 확인하거나 다른 AI 엔진을 선택해 주세요.`,
            "gemini",
          );
        }

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
    if (error instanceof AiAnalysisError) throw error;
    throw new AiAnalysisError(formatProviderTransportError("Gemini", error), "gemini");
  }

  throw new AiAnalysisError(
    formatProviderApiError("gemini", "Gemini", lastStatus, lastBody, modelsToTry),
    "gemini",
  );
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
  return requestGeminiGenerateContent(apiKey, model, {
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
      maxOutputTokens: 8192,
    },
  });
}

function normalizeAiJson(
  content: string | undefined,
  files: UploadedFileSummary[],
  provider: "openai" | "gemini" | "claude",
  evaluationContext: EvaluationContext,
  items: EvaluationItem[],
  baseWarnings: string[],
): UploadAnalysisResult {
  if (!content?.trim()) {
    throw new AiAnalysisError(
      `${providerLabel(provider)} 응답 본문이 비어 있습니다. 연결 테스트는 통과했어도 실제 문서 분석(JSON 응답)은 실패할 수 있습니다. 파일 크기를 줄이거나 다른 AI 엔진을 선택해 주세요.`,
      provider,
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractJsonContent(content) ?? content) as Record<string, unknown>;
  } catch {
    throw new AiAnalysisError(
      `${providerLabel(provider)} 응답 JSON 파싱에 실패했습니다. 모델이 지정 형식으로 답하지 않았습니다. 다시 시도하거나 다른 AI 엔진을 선택해 주세요.`,
      provider,
    );
  }

  const evaluationPreview = normalizeEvaluations(parsed.evaluationPreview, evaluationContext, items, files);
  if (evaluationPreview.length === 0) {
    throw new AiAnalysisError(
      `${providerLabel(provider)} 분석 결과에 평가 항목이 없습니다. 자료 추출 또는 모델 응답을 확인한 뒤 다시 시도해 주세요.`,
      provider,
    );
  }

  return attachContextMetadata(
    {
      provider,
      mode: "live",
      summary: String(parsed.summary ?? "업로드 자료와 실시간 법령·경관지구 정보를 기반으로 AI 분석을 완료했습니다."),
      documentSections: normalizeSections(parsed.documentSections),
      evaluationPreview,
      warnings: baseWarnings,
    },
    evaluationContext,
    items,
  );
}

function providerLabel(provider: "openai" | "gemini" | "claude"): string {
  return provider === "openai" ? "ChatGPT" : provider === "gemini" ? "Gemini" : "Claude";
}

function normalizeSections(value: unknown): UploadAnalysisResult["documentSections"] {
  if (!Array.isArray(value) || value.length === 0) return [];

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
  if (!Array.isArray(value) || value.length === 0) return [];

  const defaultGuidelineRefs = evaluationContext.guidelines.slice(0, 2).map((guide) => `${guide.title} ${guide.section}`);

  return value.slice(0, Math.max(items.length, 8)).map((row, index) => {
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
