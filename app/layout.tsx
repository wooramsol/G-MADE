import type { Metadata } from "next";
import "./globals.css";
import GlobalHeader from "./global-header";
import SiteFooter from "./site-footer";
import ToastHost from "./toast-host";

const PROJECT_NAME = "G-MADE AI-전문가 하이브리드 평가 시스템";

export const metadata: Metadata = {
  title: PROJECT_NAME,
  description: "경관사전심의·공공디자인심의를 위한 AI·전문가 하이브리드 평가 지원 시스템",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <div className="fixed left-0 right-0 top-0 z-50 border-b border-amber-300 bg-amber-100 px-4 py-1.5 text-center text-xs font-semibold text-amber-950 shadow-sm">
          <span className="font-bold tracking-wide">STAGING:</span> 정식 서비스 배포 전 검증용 시범 운영 환경입니다. 문의: G-MADE HIVE 연구소장 정우람솔
        </div>
        <div className="pt-9">
          <ToastHost />
          <GlobalHeader />
          {children}
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
