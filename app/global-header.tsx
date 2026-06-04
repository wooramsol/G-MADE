import Image from "next/image";
import Link from "next/link";
import TopNavigation from "./top-navigation";

export default function GlobalHeader() {
  return (
    <header className="bg-white">
      <div className="bg-gradient-to-r from-[#0f4d87] via-[#176dab] to-[#15345b] px-6 py-3 text-white shadow-sm">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <Link className="flex items-center gap-4" href="/">
            <div className="my-2 flex h-14 w-56 items-center">
              <Image
                alt="G-MADE HIVE"
                className="h-auto w-full object-contain"
                height={180}
                priority
                src="/brand/banner-low.png"
                width={520}
              />
            </div>
            <div>
              <p className="text-xs font-semibold text-blue-100">AI-전문가 사전심의 시스템</p>
              <h1 className="text-lg font-black text-white">AI-Human Hybrid Evaluation System</h1>
            </div>
          </Link>
        </div>
      </div>
      <TopNavigation />
    </header>
  );
}
