import type { Metadata } from "next";
import ClearLegacyLocalProjects from "@/components/clear-legacy-local-projects";
import "./globals.css";
import GlobalHeader from "./global-header";
import SiteFooter from "./site-footer";
import ToastHost from "./toast-host";

const PROJECT_NAME = "G-MADE AI-전문가 하이브리드 평가 시스템";

export const metadata: Metadata = {
  title: PROJECT_NAME,
  description: "경관사전심의·공공디자인심의를 위한 AI·전문가 하이브리드 평가 지원 시스템",
  // 아이패드·아이폰 홈 화면 설치 시 전체화면 앱으로 실행
  appleWebApp: {
    capable: true,
    title: "G-MADE",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport = {
  themeColor: "#15345b",
  width: "device-width",
  initialScale: 1,
  // 아이패드에서 입력 포커스 시 과도한 확대 방지하되 접근성 위해 수동 확대는 허용
  viewportFit: "cover" as const,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <div className="fixed left-0 right-0 top-0 z-50 border-b border-amber-300 bg-amber-100 px-4 py-1.5 text-center text-xs font-semibold text-amber-950 shadow-sm">
          <span className="font-bold tracking-wide">STAGING:</span> 정식 서비스 배포 전 검증용 시범 운영 환경입니다. 문의: G-MADE HIVE 연구소장 정우람솔
        </div>
        <div className="pt-9">
          <ClearLegacyLocalProjects />
          <ToastHost />
          <GlobalHeader />
          {children}
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
