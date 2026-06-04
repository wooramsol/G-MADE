import Image from "next/image";
import Link from "next/link";
import HeaderActions from "./header-actions";

export default function GlobalHeader() {
  return (
    <header className="bg-white">
      <div className="bg-gradient-to-r from-[#0f4d87] via-[#176dab] to-[#15345b] px-6 py-4 text-white shadow-sm">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <Link className="flex items-center gap-4" href="/">
            <div className="flex h-16 w-48 items-center">
              <Image
                alt="G-MADE HIVE"
                className="h-auto w-full object-contain"
                height={180}
                priority
                src="/brand/banner.png"
                width={520}
              />
            </div>
            <div>
              <p className="text-sm font-semibold text-blue-100">G-MADE HIVE</p>
              <h1 className="text-xl font-black text-white">AI-Human Hybrid Evaluation System</h1>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden rounded-full bg-white/10 px-3 py-2 text-sm font-semibold text-blue-50 md:inline-flex">
              연구소장 정우람솔
            </span>
            <HeaderActions />
          </div>
        </div>
      </div>
      <nav className="border-b border-[#d7dee8] bg-white px-6">
        <div className="mx-auto flex max-w-[1500px] gap-2 py-3">
          <Link className="rounded-lg px-4 py-2 text-sm font-bold text-[#15345b] transition hover:bg-[#e8f1ff]" href="/">
            Dashboard
          </Link>
          <Link className="rounded-lg px-4 py-2 text-sm font-bold text-[#15345b] transition hover:bg-[#e8f1ff]" href="/projects">
            Project Management
          </Link>
        </div>
      </nav>
    </header>
  );
}
