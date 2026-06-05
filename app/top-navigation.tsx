"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "대시보드", href: "/", match: (pathname: string) => pathname === "/" },
  { label: "프로젝트 관리", href: "/projects", match: (pathname: string) => pathname.startsWith("/projects") },
  { label: "내 정보", href: "/mypage", match: (pathname: string) => pathname === "/mypage" },
] as const;

export default function TopNavigation({ isAuthenticated }: { isAuthenticated: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="border-b border-[#d7dee8] bg-white px-6">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-2 py-3">
        <div className="flex gap-2">
        {navItems.map((item) => {
          const active = item.match(pathname);

          return (
            <Link
              className={`rounded-lg px-4 py-2 text-sm font-bold transition ${
                active ? "bg-[#15345b] !text-white shadow-sm" : "text-[#15345b] hover:bg-[#e8f1ff]"
              }`}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          );
        })}
        </div>
        {!isAuthenticated ? (
          <Link className="rounded-lg bg-[#15345b] px-4 py-2 text-sm font-bold text-white" href="/login">
            로그인
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
