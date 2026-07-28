import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** 대시보드 제거 — 프로젝트 관리가 메인 페이지입니다. */
export default function Home() {
  redirect("/projects");
}
