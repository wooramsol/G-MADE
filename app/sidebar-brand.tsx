import Image from "next/image";

export default function SidebarBrand() {
  return (
    <div className="border-b border-white/10 px-4 py-5">
      <div className="rounded-2xl bg-white p-3 shadow-sm">
        <Image
          alt="G-MADE HIVE - Collective Intelligence for Global Evaluation"
          className="h-auto w-full"
          height={576}
          priority
          src="/brand/gmade-hive-banner.svg"
          width={1024}
        />
      </div>
    </div>
  );
}
