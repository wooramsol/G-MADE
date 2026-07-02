import { analyzeWithClaude } from "./ai/analyze-claude";
import { AiAnalysisError } from "./ai/analysis-error";
import { getGeminiApiKey, getGeminiModel, getOpenAiApiKey } from "./ai/env-keys";
import { buildAnalysisPrompt } from "./ai/analysis-prompt";
import type { AnalysisPromptOptions } from "./ai/analysis-prompt-options";
import { AI_EVALUATOR_SYSTEM_PROMPT } from "./ai/evaluator-system-prompt";
import { chunkEvaluationItems, getProviderItemBatchSize, shouldBatchProviderAnalysis } from "./ai/item-batches";
import { isRetryableProviderError, retryDelayMs } from "./ai/retryable-api-error";
import { buildFallbackRecommendation, isGenericRecommendation } from "./ai/fallback-recommendation";
import type { AnalyzeUploadedFilesInput, UploadedFileSummary, UploadAnalysisResult } from "./ai/analysis-types";
import { extractJsonContent } from "./ai/extract-json";
import { formatProviderApiError } from "./ai/format-api-error";
import { getGeminiModelsToTry } from "./ai/gemini-models";
import { requestGeminiGenerateContent } from "./ai/gemini-request";
import { describeGeminiResponseIssue, readGeminiGenerateContent } from "./ai/gemini-response";
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
    return analyzeWithClaudeBatched(files, evaluationContext, items, baseWarnings);
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

  return analyzeWithClaudeBatched(files, evaluationContext, items, baseWarnings);
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
  if (shouldBatchProviderAnalysis("openai", items.length)) {
    return analyzeProviderInBatches("openai", files, evaluationContext, items, baseWarnings);
  }

  return analyzeWithOpenAiOnce(files, evaluationContext, items, baseWarnings);
}

async function analyzeWithOpenAiOnce(
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
  items: EvaluationItem[],
  baseWarnings: string[],
  promptOptions?: AnalysisPromptOptions,
): Promise<UploadAnalysisResult> {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) {
    throw new AiAnalysisError(
      "OPENAI_API_KEY가 Vercel 환경 변수에 설정되지 않았습니다. Settings → Environment Variables에서 추가한 뒤 재배포해 주세요.",
      "openai",
    );
  }

  let lastStatus = 500;
  let lastBody = "";

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
          response_format: { type: "json_object" },
          max_tokens: 8192,
          messages: [
            {
              role: "system",
              content: AI_EVALUATOR_SYSTEM_PROMPT,
            },
            {
              role: "user",
              content: buildAnalysisPrompt(files, evaluationContext, items, promptOptions),
            },
          ],
          temperature: 0.2,
        }),
      });

      if (response.ok) {
        const payload = await response.json();
        const choice = payload.choices?.[0];
        if (choice?.finish_reason === "length") {
          throw new AiAnalysisError(
            "ChatGPT 출력 토큰 한도에 도달해 JSON 응답이 잘렸습니다. 평가 항목이 많으면 자동 분할 분석이 적용됩니다. 다시 시도해 주세요.",
            "openai",
          );
        }
        return normalizeAiJson(choice?.message?.content, files, "openai", evaluationContext, items, baseWarnings);
      }

      lastStatus = response.status;
      lastBody = await response.text();

      if (isRetryableProviderError(response.status, lastBody) && attempt < 2) {
        await sleep(retryDelayMs(attempt));
        continue;
      }

      break;
    }
  } catch (error) {
    if (error instanceof AiAnalysisError) throw error;
    throw new AiAnalysisError(formatProviderTransportError("OpenAI", error), "openai");
  }

  throw new AiAnalysisError(formatProviderApiError("openai", "OpenAI", lastStatus, lastBody), "openai");
}

async function analyzeWithGemini(
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
  items: EvaluationItem[],
  baseWarnings: string[],
): Promise<UploadAnalysisResult> {
  if (shouldBatchProviderAnalysis("gemini", items.length)) {
    return analyzeProviderInBatches("gemini", files, evaluationContext, items, baseWarnings);
  }

  return analyzeWithGeminiOnce(files, evaluationContext, items, baseWarnings);
}

async function analyzeWithClaudeBatched(
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
  items: EvaluationItem[],
  baseWarnings: string[],
): Promise<UploadAnalysisResult> {
  if (shouldBatchProviderAnalysis("claude", items.length)) {
    return analyzeProviderInBatches("claude", files, evaluationContext, items, baseWarnings);
  }

  return analyzeWithClaudeOnce(files, evaluationContext, items, baseWarnings);
}

async function analyzeProviderInBatches(
  provider: "gemini" | "claude" | "openai",
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
  items: EvaluationItem[],
  baseWarnings: string[],
): Promise<UploadAnalysisResult> {
  const batches = chunkEvaluationItems(items, getProviderItemBatchSize(provider));
  const mergedWarnings = [...baseWarnings];
  mergedWarnings.push(
    `${providerLabel(provider)} 분석: 평가 항목 ${items.length}개를 ${batches.length}회로 나누어 처리합니다.`,
  );

  const partials: UploadAnalysisResult[] = [];
  for (let index = 0; index < batches.length; index += 1) {
    const batchItems = batches[index]!;
    const promptOptions: AnalysisPromptOptions = {
      compact: true,
      evaluationOnly: index > 0,
    };
    const partial =
      provider === "gemini"
        ? await analyzeWithGeminiOnce(files, evaluationContext, batchItems, mergedWarnings, promptOptions)
        : provider === "claude"
          ? await analyzeWithClaudeOnce(files, evaluationContext, batchItems, mergedWarnings, promptOptions)
          : await analyzeWithOpenAiOnce(files, evaluationContext, batchItems, mergedWarnings, promptOptions);
    partials.push(partial);
  }

  return mergeBatchAnalysisResults(provider, partials, evaluationContext, items, mergedWarnings);
}

function mergeBatchAnalysisResults(
  provider: "gemini" | "claude" | "openai",
  partials: UploadAnalysisResult[],
  evaluationContext: EvaluationContext,
  items: EvaluationItem[],
  warnings: string[],
): UploadAnalysisResult {
  const first = partials[0];
  if (!first) {
    throw new AiAnalysisError(`${providerLabel(provider)} 분할 분석 결과가 비어 있습니다.`, provider);
  }

  // 배치 간 중복 itemId 제거 (뒤 배치가 앞 배치를 덮어쓰지 않도록 첫 결과 유지)
  const seenItemIds = new Set<string>();
  const evaluationPreview = partials
    .flatMap((partial) => partial.evaluationPreview)
    .filter((row) => {
      if (seenItemIds.has(row.itemId)) return false;
      seenItemIds.add(row.itemId);
      return true;
    });

  const missingItems = items.filter((item) => !seenItemIds.has(item.id));
  if (missingItems.length > 0) {
    warnings.push(
      `분할 분석 결과에서 ${missingItems.length}개 항목(${missingItems
        .map((item) => item.detailItem)
        .join(", ")})의 결과가 누락되었습니다. 재분석을 권장합니다.`,
    );
  }

  return attachContextMetadata(
    {
      provider,
      mode: "live",
      summary: first.summary,
      documentSections: first.documentSections,
      evaluationPreview,
      warnings,
    },
    evaluationContext,
    items,
  );
}

async function analyzeWithClaudeOnce(
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
  items: EvaluationItem[],
  baseWarnings: string[],
  promptOptions?: AnalysisPromptOptions,
): Promise<UploadAnalysisResult> {
  return analyzeWithClaude(
    files,
    evaluationContext,
    items,
    {
      normalizeAiJson: (content, batchItems) =>
        normalizeAiJson(content, files, "claude", evaluationContext, batchItems, baseWarnings),
    },
    promptOptions,
  );
}

async function analyzeWithGeminiOnce(
  files: UploadedFileSummary[],
  evaluationContext: EvaluationContext,
  items: EvaluationItem[],
  baseWarnings: string[],
  promptOptions?: AnalysisPromptOptions,
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
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const response = await requestGemini(apiKey, model, files, evaluationContext, items, promptOptions);

        if (response.ok) {
          const payload = await response.json();
          const gemini = readGeminiGenerateContent(payload);
          const issue = describeGeminiResponseIssue({
            blockReason: gemini.blockReason,
            finishReason: gemini.finishReason,
            hasText: Boolean(gemini.text),
          });
          if (issue) {
            throw new AiAnalysisError(issue, "gemini");
          }

          return normalizeAiJson(gemini.text, files, "gemini", evaluationContext, items, baseWarnings);
        }

        lastStatus = response.status;
        lastBody = await response.text();

        if (response.status === 404) {
          break;
        }

        if (isRetryableProviderError(response.status, lastBody) && attempt < 2) {
          await sleep(retryDelayMs(attempt));
          continue;
        }

        break;
      }

      if (lastStatus === 404) {
        continue;
      }
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
  promptOptions?: AnalysisPromptOptions,
) {
  return requestGeminiGenerateContent(
    apiKey,
    model,
    {
      systemInstruction: {
        parts: [{ text: AI_EVALUATOR_SYSTEM_PROMPT }],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: buildAnalysisPrompt(files, evaluationContext, items, promptOptions) }],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        maxOutputTokens: 8192,
      },
    },
    110_000,
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
      `${providerLabel(provider)} 응답 JSON 파싱에 실패했습니다. 출력이 잘렸거나 형식이 올바르지 않습니다. 응답 앞부분: ${content.slice(0, 240)}`,
      provider,
    );
  }

  const evaluationPreview = normalizeEvaluations(parsed.evaluationPreview, evaluationContext, items, files, baseWarnings);
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

function normalizeItemName(value: string): string {
  return value.toLowerCase().replace(/[\s·().,\-_/]/g, "");
}

/**
 * AI 응답의 evaluationPreview를 평가항목에 매핑한다.
 *
 * 응답 순서·개수가 요청과 다를 수 있으므로 itemName으로 매칭하고,
 * 매칭되지 않은 행은 남은 항목에 순서대로 배정한다. 응답에서 누락된 항목은
 * 기본 근거로 보완하고 경고를 남긴다 (조용한 오매핑·누락 방지).
 */
function normalizeEvaluations(
  value: unknown,
  evaluationContext: EvaluationContext,
  items: EvaluationItem[],
  files: UploadedFileSummary[] = [],
  warnings?: string[],
): UploadAnalysisResult["evaluationPreview"] {
  if (!Array.isArray(value) || value.length === 0) return [];

  const defaultGuidelineRefs = evaluationContext.guidelines.slice(0, 2).map((guide) => `${guide.title} ${guide.section}`);

  const itemsByName = new Map<string, EvaluationItem>();
  for (const item of items) {
    itemsByName.set(normalizeItemName(item.detailItem), item);
  }

  const rowByItemId = new Map<string, Record<string, unknown>>();
  const unmatchedRows: Record<string, unknown>[] = [];

  for (const raw of value) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const rowName = normalizeItemName(String(row.itemName ?? ""));
    const matched =
      itemsByName.get(rowName) ??
      (rowName
        ? items.find((item) => {
            const itemName = normalizeItemName(item.detailItem);
            return itemName.includes(rowName) || rowName.includes(itemName);
          })
        : undefined);

    if (matched && !rowByItemId.has(matched.id)) {
      rowByItemId.set(matched.id, row);
    } else {
      unmatchedRows.push(row);
    }
  }

  // 이름 매칭에 실패한 행은 아직 결과가 없는 항목에 순서대로 배정
  for (const item of items) {
    if (rowByItemId.has(item.id)) continue;
    const nextRow = unmatchedRows.shift();
    if (!nextRow) break;
    rowByItemId.set(item.id, nextRow);
  }

  const missingItems = items.filter((item) => !rowByItemId.has(item.id));
  if (missingItems.length > 0 && warnings) {
    warnings.push(
      `AI 응답에서 ${missingItems.length}개 항목(${missingItems
        .map((item) => item.detailItem)
        .join(", ")})이 누락되어 평가 기준 기반 기본 근거로 표시합니다. 해당 항목은 재분석을 권장합니다.`,
    );
  }

  const matchedScores = [...rowByItemId.values()]
    .map((row) => Number(row.score))
    .filter((score) => Number.isFinite(score));
  const fallbackScore = clampNumber(
    matchedScores.length > 0
      ? matchedScores.reduce((sum, score) => sum + score, 0) / matchedScores.length
      : 60,
  );

  return items.map((item) => {
    const row = rowByItemId.get(item.id);
    const score = clampNumber(Number(row?.score ?? fallbackScore));
    const aiLawRefs = Array.isArray(row?.lawRefs)
      ? row.lawRefs.map((law: unknown) => String(law)).filter(Boolean)
      : [];
    const aiGuidelineRefs = Array.isArray(row?.guidelineRefs)
      ? row.guidelineRefs.map((guide: unknown) => String(guide)).filter(Boolean)
      : [];

    return {
      itemId: item.id,
      itemName: item.detailItem,
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
