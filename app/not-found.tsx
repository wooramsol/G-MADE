import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-[60vh] bg-[#f4f7fb] px-6 py-16 text-[#172033]">
      <div className="mx-auto max-w-[560px] rounded-md border border-[#d7dee8] bg-white p-8 text-center panel-shadow">
        <p className="text-lg font-bold text-[#15345b]">페이지를 찾을 수 없습니다</p>
        <p className="mt-2 text-sm leading-6 text-[#475569]">주소가 바뀌었거나 삭제된 페이지입니다.</p>
        <Link className="primary-action-blue mt-6 inline-flex rounded-md px-4 py-2 text-sm font-bold" href="/projects">
          목록으로
        </Link>
      </div>
    </main>
  );
}
