import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

export default NextAuth(authConfig).auth;

export const config = {
  // 정적 자산(폰트·아이콘·지도 마커·PWA 매니페스트)은 인증 검사에서 제외
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|fonts/|icons/|leaflet/|manifest.webmanifest).*)"],
};
