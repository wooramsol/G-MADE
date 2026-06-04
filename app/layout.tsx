import type { Metadata } from "next";
import "./globals.css";
import GlobalHeader from "./global-header";
import SiteFooter from "./site-footer";

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
        <div className="fixed left-0 right-0 top-0 z-50 border-b border-amber-300 bg-amber-100 px-4 py-1.5 text-center text-xs font-bold text-amber-950 shadow-sm">
          이 사이트는 현재 정식배포가 아닌 테스트서버입니다. 담당자: 연구소장 정우람솔
        </div>
        <GlobalHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
