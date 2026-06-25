import { Badge } from "@/components/typography";

type DemoModeBannerProps = {
  className?: string;
  warnings?: string[];
};

function pickPrimaryAiWarning(warnings: string[]): string | null {
  const aiWarning = warnings.find((warning) =>
    /API|키|Gemini|OpenAI|Claude|모델|429|401|404|데모|quota|rate/i.test(warning),
  );
  return aiWarning ?? warnings[0] ?? null;
}

export default function DemoModeBanner({ className = "", warnings = [] }: DemoModeBannerProps) {
  const primaryWarning = pickPrimaryAiWarning(warnings);

  return (
    <div
      className={`rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950 ${className}`}
      role="status"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-amber-200 text-amber-950">데모 분석</Badge>
        <p className="font-semibold">
          AI API 키가 없거나 오류로 샘플 결과가 표시됩니다. 실제 심의 판단에는 사용하지 마세요.
        </p>
      </div>
      {primaryWarning ? (
        <p className="mt-2 text-xs font-semibold text-amber-900">원인: {primaryWarning}</p>
      ) : (
        <p className="mt-1 text-xs text-amber-900">
          Vercel에 GEMINI_API_KEY, OPENAI_API_KEY, CLAUDE_API_KEY 중 하나를 설정한 뒤 다시 분석하면 실제 결과를 받을 수
          있습니다.
        </p>
      )}
    </div>
  );
}
