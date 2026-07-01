/** Gemini 2.5 Flash 등 — API 상한(65,536). 인위적으로 8,192로 줄이지 않습니다. */
export const GEMINI_ANALYSIS_MAX_OUTPUT_TOKENS = 65_536;

/** Claude Sonnet 4 계열 — 상세 JSON이지만 240초 안에 끝나도록 상한을 둡니다. */
export const CLAUDE_ANALYSIS_MAX_OUTPUT_TOKENS = 16_384;

/** 타임아웃 재시도(Haiku) 시 출력 상한. */
export const CLAUDE_FAST_RETRY_MAX_OUTPUT_TOKENS = 8_192;

/** PDF·이미지 비전 입력이 있을 때는 컨텍스트 여유를 두고 출력 상한을 낮춥니다. */
export const CLAUDE_VISION_ANALYSIS_MAX_OUTPUT_TOKENS = 16_384;

/** OpenAI gpt-4o 계열 JSON 분석 응답 상한. */
export const OPENAI_ANALYSIS_MAX_COMPLETION_TOKENS = 16_384;
