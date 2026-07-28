/** 페이지 데이터 로딩 중 표시되는 공용 로더. */
export default function PageLoader({ label = "불러오는 중…" }: { label?: string }) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center bg-[#f4f7fb]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#d7dee8] border-t-[#2463b3]" />
        <p className="text-sm font-bold text-[#64748b]">{label}</p>
      </div>
    </main>
  );
}
