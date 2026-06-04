import Link from "next/link";

export default function HeaderActions() {
  return (
    <Link
      className="rounded-lg border border-white/25 px-3 py-2 text-sm font-bold text-white transition hover:bg-white/10"
      href="/mypage"
    >
      마이페이지
    </Link>
  );
}
