export default function SidebarBrand() {
  return (
    <div className="border-b border-white/10 px-5 py-6">
      <div className="rounded-2xl bg-white px-4 py-5 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-[#1f8ed3] to-[#15345b] text-4xl font-black text-white">
          G
        </div>
        <div className="mt-4 text-2xl font-black tracking-tight">
          <span className="text-[#1f6fb2]">G-MADE</span>
          <span className="text-[#2f3a4a]"> HIVE</span>
        </div>
        <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#15345b]">
          Collective Intelligence for Global Evaluation
        </p>
      </div>
    </div>
  );
}
