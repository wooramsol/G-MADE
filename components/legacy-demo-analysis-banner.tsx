import { Badge } from "@/components/typography";

type LegacyDemoAnalysisBannerProps = {
  className?: string;
  warnings?: string[];
};

export default function LegacyDemoAnalysisBanner({
  className = "",
  warnings = [],
}: LegacyDemoAnalysisBannerProps) {
  const primaryWarning = warnings[0];

  return (
    <div
      className={`rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950 ${className}`}
      role="status"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-amber-200 text-amber-950">구버전 데모 결과</Badge>
        <p className="font-semibold">
          이 평가는 예전 데모 분석 기능으로 저장된 결과입니다. 점수·의견은 실제 AI 분석이 아니므로 참고하지 마세요.
        </p>
      </div>
      {primaryWarning ? (
        <p className="mt-2 text-xs font-semibold text-amber-900">{primaryWarning}</p>
      ) : null}
    </div>
  );
}
