import Image from "next/image";
import Link from "next/link";
import TopNavigation from "./top-navigation";

export default function GlobalHeader() {
  return (
    <header className="bg-white">
      <div className="bg-gradient-to-r from-[#0f4d87] via-[#176dab] to-[#15345b] px-6 py-4 text-white shadow-sm">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
          <Link className="flex items-center gap-4" href="/">
            <div className="my-6 flex h-20 w-60 items-center">
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
              <p className="text-sm font-semibold text-blue-100">G-MADE HIVE</p>
              <h1 className="text-xl font-black text-white">AI-Human Hybrid Evaluation System</h1>
            </div>
          </Link>
        </div>
      </div>
      <TopNavigation />
    </header>
  );
}
