/** Gemini 2.5 Flash 등 — API 상한(65,536). 인위적으로 8,192로 줄이지 않습니다. */
export const GEMINI_ANALYSIS_MAX_OUTPUT_TOKENS = 65_536;

/** Claude Sonnet 4 계열 — API 상한(64,000). 텍스트 전용 분석에 사용합니다. */
export const CLAUDE_ANALYSIS_MAX_OUTPUT_TOKENS = 64_000;

/** PDF·이미지 비전 입력이 있을 때는 컨텍스트 여유를 두고 출력 상한을 낮춥니다. */
export const CLAUDE_VISION_ANALYSIS_MAX_OUTPUT_TOKENS = 16_384;

/** OpenAI gpt-4o 계열 JSON 분석 응답 상한. */
export const OPENAI_ANALYSIS_MAX_COMPLETION_TOKENS = 16_384;
