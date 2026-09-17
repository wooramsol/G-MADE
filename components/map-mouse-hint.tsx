/**
 * 지도 조작 힌트 그래픽 — 좌하단에 나침반과 같은 톤의 작은 아이콘으로,
 * 텍스트 안내를 대체한다 (화면 가림 최소화). 자세한 설명은 title 툴팁.
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
      <svg fill="none" height="30" viewBox="0 0 44 32" width="42">
        {/* 마우스 본체 */}
        <rect height="20" rx="6" stroke="#475569" strokeWidth="1.6" width="13" x="15.5" y="6" />
        <line stroke="#475569" strokeWidth="1.6" x1="22" x2="22" y1="9" y2="13" />
        {variant === "pan" ? (
          <g fill="#2463b3">
            {/* 상하좌우 이동 화살표 */}
            <path d="M22 0 L24.6 3.6 L19.4 3.6 Z" />
            <path d="M22 32 L24.6 28.4 L19.4 28.4 Z" />
            <path d="M10 16 L13.6 13.4 L13.6 18.6 Z" />
            <path d="M34 16 L30.4 13.4 L30.4 18.6 Z" />
          </g>
        ) : (
          <g>
            {/* 좌우 회전 곡선 화살표 */}
            <path d="M12 22 A11 8 0 0 1 12 10" fill="none" stroke="#2463b3" strokeWidth="1.8" />
            <path d="M12 7.5 L15.5 10 L11 12 Z" fill="#2463b3" />
            <path d="M32 10 A11 8 0 0 1 32 22" fill="none" stroke="#2463b3" strokeWidth="1.8" />
            <path d="M32 24.5 L28.5 22 L33 20 Z" fill="#2463b3" />
          </g>
        )}
      </svg>
    </div>
  );
}
