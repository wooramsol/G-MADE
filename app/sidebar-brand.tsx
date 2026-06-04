import Image from "next/image";

export default function SidebarBrand() {
  return (
    <div className="border-b border-[#d7dee8] px-4 py-5">
      <div className="rounded-2xl border border-[#d7dee8] bg-white p-2 shadow-sm">
        <Image
          alt="G-MADE HIVE - Collective Intelligence for Global Evaluation"
          className="h-auto w-full rounded-xl"
          height={576}
          priority
          src="/brand/gmade-hive-banner.jpg"
          width={1024}
        />
      </div>
    </div>
  );
}
