import { getReleaseVersionLabel } from "@/lib/release-version";

export default function GlobalHeaderTitle() {
  const versionLabel = getReleaseVersionLabel();

  return (
    <div className="min-w-0">
      <p className="type-brand-subtitle">경관·공공디자인 사전심의 지원</p>
      <h1
        className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1 leading-tight"
        title={`BlinkType ${versionLabel}`}
      >
        <span className="inline-flex items-baseline text-xl font-black tracking-tight text-white sm:text-2xl">
          <span className="bg-gradient-to-r from-white via-blue-50 to-sky-200 bg-clip-text text-transparent">
            Blink
          </span>
          <span aria-hidden className="blink-type-space" />
          <span className="relative text-white">
            Type
            <span
              aria-hidden
              className="blink-type-cursor ml-0.5 inline-block h-[0.92em] w-[2px] translate-y-[0.06em] bg-sky-200"
            />
          </span>
        </span>
        <span className="hidden text-white/35 sm:inline" aria-hidden>
          |
        </span>
        <span className="inline-flex items-center rounded-md border border-white/25 bg-white/10 px-2 py-0.5 text-[11px] font-bold tracking-[0.14em] text-sky-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] sm:text-xs">
          <span className="text-white/70">ver.</span>
          <span className="ml-1 text-white">{versionLabel}</span>
        </span>
      </h1>
      <p className="mt-1 text-sm font-semibold text-blue-100/95 sm:text-[15px]">
        AI-전문가 하이브리드 평가 시스템
      </p>
    </div>
  );
}
