import Image from "next/image";

export default function SidebarBrand() {
  return (
    <div className="border-b border-[#eef2f7] px-3 py-4">
      <div className="bg-white">
        <Image
          alt="G-MADE HIVE - Collective Intelligence for Global Evaluation"
          className="h-auto w-full"
          height={576}
          priority
          src="/brand/gmade-hive-banner.jpg"
          width={1024}
        />
      </div>
    </div>
  );
}
