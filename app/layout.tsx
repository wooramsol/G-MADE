import type { Metadata } from "next";
import "./globals.css";

const PROJECT_NAME = "G-MADE Hybrid Evaluation System";

export const metadata: Metadata = {
  title: PROJECT_NAME,
  description:
    "AI-based hybrid evaluation platform for landscape preliminary review and public design deliberation.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
