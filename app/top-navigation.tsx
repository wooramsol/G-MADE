"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { RoleCode } from "@/lib/types";
import NotificationBell from "./notification-bell";

type NavItem = { label: string; href: "/projects" | "/mypage" | "/admin/users" | "/about"; match: (pathname: string) => boolean };

export default function TopNavigation({ isAuthenticated, role }: { isAuthenticated: boolean; role: RoleCode | null }) {
  const pathname = usePathname();
  const navItems: NavItem[] = [
    { label: "G-MADE HIVE란?", href: "/about", match: (path) => path === "/about" },
    {
      label: role === "APPLICANT" ? "내 심의 신청" : "프로젝트 관리",
      href: "/projects",
      match: (path) => path === "/" || path.startsWith("/projects"),
    },
    ...(role === "ADMIN" ? [{ label: "계정 관리", href: "/admin/users" as const, match: (path: string) => path.startsWith("/admin") }] : []),
    { label: "내 정보", href: "/mypage", match: (path) => path === "/mypage" },
  ];

  return (
    <nav className="border-b border-[#d7dee8] bg-white px-6">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-2 py-3">
        <div className="flex gap-2">
        {navItems.map((item) => {
          const active = item.match(pathname);

          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`type-nav-link rounded-lg px-4 py-2 transition ${
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
        {isAuthenticated ? <NotificationBell /> : null}
        {!isAuthenticated ? (
          <Link className="type-nav-link rounded-lg bg-[#15345b] px-4 py-2 !text-white shadow-sm" href="/login">
            로그인
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
