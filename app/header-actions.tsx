import Link from "next/link";

const accountLinks = [
  { label: "로그인", href: "/login" },
  { label: "마이페이지", href: "/mypage" },
  { label: "설정", href: "/settings" },
] as const;

export default function HeaderActions() {
  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm font-bold">
      {accountLinks.map((link) => (
        <Link
          className="rounded-lg border border-white/25 px-3 py-2 text-white transition hover:bg-white/10"
          href={link.href}
          key={link.href}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
