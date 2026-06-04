"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Dashboard", href: "/", match: (pathname: string) => pathname === "/" },
  { label: "Project Management", href: "/projects", match: (pathname: string) => pathname.startsWith("/projects") },
  { label: "마이페이지", href: "/mypage", match: (pathname: string) => pathname === "/mypage" },
] as const;

export default function TopNavigation() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-[#d7dee8] bg-white px-6">
      <div className="mx-auto flex max-w-[1500px] gap-2 py-3">
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
    </nav>
  );
}
