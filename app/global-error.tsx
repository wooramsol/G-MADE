"use client";

/** 최상위 레이아웃까지 실패했을 때의 마지막 안내 화면 (자체 html/body 필요) */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "sans-serif", background: "#f4f7fb", color: "#172033" }}>
        <div style={{ maxWidth: 560, margin: "80px auto", padding: 32, background: "#fff", border: "1px solid #d7dee8", borderRadius: 6, textAlign: "center" }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: "#15345b" }}>화면을 불러오는 중 문제가 생겼습니다</p>
          <p style={{ fontSize: 14, color: "#475569" }}>잠시 후 다시 시도해 주세요.</p>
          {error.digest ? <p style={{ fontSize: 12, color: "#94a3b8" }}>오류 번호: {error.digest}</p> : null}
          <button onClick={() => reset()} style={{ marginTop: 16, padding: "8px 16px", fontWeight: 700, color: "#fff", background: "#15345b", border: 0, borderRadius: 6, cursor: "pointer" }} type="button">
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
