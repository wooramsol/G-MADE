"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function HeaderActions() {
  const pathname = usePathname();
  const active = pathname === "/mypage";

  return (
    <Link
      className={`rounded-lg border px-3 py-2 text-sm font-bold transition ${
        active ? "border-white bg-white text-[#15345b]" : "border-white/25 text-white hover:bg-white/10"
      }`}
      href="/mypage"
    >
      마이페이지
    </Link>
  );
}
