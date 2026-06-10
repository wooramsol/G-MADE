import type { Metadata } from "next";
import "./globals.css";
import GlobalHeader from "./global-header";
import SiteFooter from "./site-footer";
import ToastHost from "./toast-host";

const PROJECT_NAME = "G-MADE Hybrid Evaluation System";

export const metadata: Metadata = {
  title: PROJECT_NAME,
  description:
    "AI-based hybrid evaluation platform for landscape preliminary review and public design deliberation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        <div className="fixed left-0 right-0 top-0 z-50 border-b border-amber-300 bg-amber-100 px-4 py-1.5 text-center text-xs font-semibold text-amber-950 shadow-sm">
          <span className="font-bold tracking-wide">STAGING:</span> 정식 서비스 배포 전 검증용 시범 운영 환경입니다. 문의: G-MADE HIVE 연구소장 정우람솔
        </div>
        <ToastHost />
        <GlobalHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
