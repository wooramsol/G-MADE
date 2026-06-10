"use client";

type EvaluationWeightSliderProps = {
  aiWeight: number;
  onChange: (value: number) => void;
};

export default function EvaluationWeightSlider({ aiWeight, onChange }: EvaluationWeightSliderProps) {
  const expertWeight = 100 - aiWeight;

  return (
    <div className="mt-5">
      <div className="flex items-stretch gap-4">
        <div className="flex w-[104px] shrink-0 flex-col justify-center rounded-xl border border-[#2463b3]/20 bg-[#eef4fb] px-3 py-3 text-center">
          <p className="text-[11px] font-bold text-[#2463b3]">AI 평가</p>
          <p className="mt-1 text-2xl font-black leading-none text-[#2463b3]">{aiWeight}%</p>
        </div>

        <div className="flex flex-1 flex-col justify-center gap-2 py-1">
          <div className="relative h-10">
            <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-full bg-[#e2e8f0]">
              <div className="absolute inset-y-0 left-0 bg-[#2463b3]" style={{ width: `${aiWeight}%` }} />
              <div className="absolute inset-y-0 right-0 bg-[#15345b]" style={{ width: `${expertWeight}%` }} />
            </div>
            <input
              aria-label="AI 평가 가중치"
              className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-[#2463b3] [&::-moz-range-thumb]:shadow-md [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-[#2463b3] [&::-webkit-slider-thumb]:shadow-md"
              max={100}
              min={0}
              step={10}
              type="range"
              value={aiWeight}
              onChange={(event) => onChange(Number(event.target.value))}
            />
          </div>
          <div className="flex justify-between text-[11px] font-semibold text-[#64748b]">
            <span>왼쪽: AI 비중</span>
            <span>오른쪽: 전문가 비중</span>
          </div>
        </div>

        <div className="flex w-[104px] shrink-0 flex-col justify-center rounded-xl border border-[#15345b]/15 bg-slate-100 px-3 py-3 text-center">
          <p className="text-[11px] font-bold text-[#15345b]">전문가 평가</p>
          <p className="mt-1 text-2xl font-black leading-none text-[#15345b]">{expertWeight}%</p>
        </div>
      </div>
    </div>
  );
}
