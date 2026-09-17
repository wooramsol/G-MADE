/**
 * 지도 조작 힌트 그래픽 — 좌하단에 나침반과 같은 톤의 작은 아이콘으로,
 * 텍스트 안내를 대체한다. 화살표는 마우스 본체에서 띄워 배치(A안 확정).
 * 자세한 설명은 title 툴팁.
 */
export function MapMouseHint({ variant }: { variant: "pan" | "orbit" }) {
  const tooltip =
    variant === "pan"
      ? "드래그: 이동 · 휠: 확대·축소"
      : "드래그: 회전 · 휠: 확대·축소";
  return (
    <div
      className="pointer-events-none absolute bottom-2.5 left-2.5 z-[500] flex h-10 w-12 items-center justify-center rounded-md border border-[#c4ccd6] bg-white/90 shadow-sm"
      title={tooltip}
    >
      <svg fill="none" height="30" viewBox="-22 -16 44 32" width="40">
        {/* 마우스 본체 */}
        <rect height="20" rx="6" stroke="#475569" strokeWidth="1.6" width="13" x="-6.5" y="-10" />
        <line stroke="#475569" strokeWidth="1.6" x1="0" x2="0" y1="-7" y2="-3" />
        {variant === "pan" ? (
          <g fill="#2463b3">
            {/* 상하좌우 이동 화살표 — 본체에서 이격 */}
            <path d="M0 -15.5 L2.8 -11.8 L-2.8 -11.8 Z" />
            <path d="M0 15.5 L2.8 11.8 L-2.8 11.8 Z" />
            <path d="M-15 0 L-11.2 -2.8 L-11.2 2.8 Z" />
            <path d="M15 0 L11.2 -2.8 L11.2 2.8 Z" />
          </g>
        ) : (
          <g>
            {/* 좌우 회전 곡선 화살표 — 본체에서 이격 */}
            <path d="M-13 6 A11 8 0 0 1 -13 -6" stroke="#2463b3" strokeWidth="1.8" />
            <path d="M-13 -8.5 L-9.5 -6 L-14 -4 Z" fill="#2463b3" />
            <path d="M13 -6 A11 8 0 0 1 13 6" stroke="#2463b3" strokeWidth="1.8" />
            <path d="M13 8.5 L9.5 6 L14 4 Z" fill="#2463b3" />
          </g>
        )}
      </svg>
    </div>
  );
}
