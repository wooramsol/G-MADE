import type { MetadataRoute } from "next";

/** PWA 매니페스트 — 아이패드·모바일 홈 화면 설치 시 전체화면 앱으로 실행됩니다. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "G-MADE HIVE — 경관심의 AI 사전평가",
    short_name: "G-MADE",
    description: "경관사전심의·공공디자인심의를 위한 AI·전문가 하이브리드 평가 지원 시스템",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f4f7fb",
    theme_color: "#15345b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
