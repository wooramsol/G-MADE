export default function SiteFooter() {
  return (
    <footer className="border-t border-[#d7dee8] bg-[#f8fafc] px-6 py-5 text-xs text-[#64748b]">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <p className="leading-6">
          문의 및 이용 안내: G-MADE HIVE 운영지원팀으로 문의하거나 프로젝트 관리자에게 연락하세요.
        </p>
        <nav className="flex flex-wrap gap-x-4 gap-y-2 font-semibold text-[#475569]">
          <a href="#">개인정보 처리방침</a>
          <a href="#">서비스 이용 약관</a>
          <a href="#">평가 데이터 관리 기준</a>
          <a href="#">법령 및 지침 안내</a>
          <a href="#">사이트 맵</a>
        </nav>
      </div>
      <div className="mx-auto mt-4 flex max-w-[1500px] flex-col gap-2 border-t border-[#d7dee8] pt-4 lg:flex-row lg:items-center lg:justify-between">
        <p>Copyright © 2026 G-MADE HIVE. All rights reserved.</p>
        <p className="font-semibold text-[#475569]">대한민국</p>
      </div>
    </footer>
  );
}
