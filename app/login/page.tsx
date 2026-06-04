import SaasPageShell from "../saas-page-shell";

export default function LoginPage() {
  return (
    <SaasPageShell
      eyebrow="Account"
      title="로그인"
      description="G-MADE HIVE의 프로젝트 평가, AI 분석, 전문가 검토 기능을 사용하기 위한 계정 로그인 화면입니다."
    >
      <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="rounded-2xl border border-[#d7dee8] bg-white p-6 panel-shadow">
          <h3 className="text-xl font-bold text-[#15345b]">계정 로그인</h3>
          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-[#15345b]">이메일</span>
              <input className="mt-2 w-full rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 outline-none focus:border-[#2463b3] focus:bg-white" placeholder="name@gmadehive.com" type="email" />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-[#15345b]">비밀번호</span>
              <input className="mt-2 w-full rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 outline-none focus:border-[#2463b3] focus:bg-white" placeholder="비밀번호" type="password" />
            </label>
            <button className="primary-action w-full rounded-xl px-4 py-3 text-sm font-bold" type="button">
              로그인
            </button>
          </div>
          <p className="mt-4 text-sm text-[#64748b]">현재는 UI 시안 단계이며 실제 인증은 Firebase/Auth 연동 시 활성화됩니다.</p>
        </div>

        <div className="rounded-2xl border border-[#d7dee8] bg-[#f8fafc] p-6">
          <h3 className="text-xl font-bold text-[#15345b]">권한별 사용 범위</h3>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              ["관리자", "평가항목, 가중치, 사용자, 통계 관리"],
              ["심사위원", "프로젝트 열람, 전문가 평가, 의견 작성"],
              ["공무원", "사업 등록, 자료 업로드, 결과 확인"],
            ].map(([role, desc]) => (
              <div className="rounded-xl border border-[#d7dee8] bg-white p-4" key={role}>
                <p className="font-bold text-[#15345b]">{role}</p>
                <p className="mt-2 text-sm leading-6 text-[#64748b]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </SaasPageShell>
  );
}
