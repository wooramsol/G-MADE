import SaasPageShell from "../saas-page-shell";

export default function MyPage() {
  return (
    <SaasPageShell
      eyebrow="Account"
      title="마이페이지"
      description="내 계정 정보, 참여 중인 심의 프로젝트, 최근 평가 활동을 확인하는 개인 업무 공간입니다."
    >
      <section className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]">
        <div className="rounded-2xl border border-[#d7dee8] bg-white p-6 panel-shadow">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e8f1ff] text-2xl font-black text-[#2463b3]">정</div>
            <div>
              <p className="text-xl font-bold text-[#15345b]">연구소장 정우람솔</p>
              <p className="mt-1 text-sm text-[#64748b]">서비스 관리자 · G-MADE HIVE</p>
            </div>
          </div>
          <dl className="mt-6 space-y-3 text-sm">
            <Info label="이메일" value="admin@gmadehive.com" />
            <Info label="권한" value="관리자" />
            <Info label="소속" value="G-MADE HIVE 운영팀" />
          </dl>
        </div>

        <div className="rounded-2xl border border-[#d7dee8] bg-white p-6 panel-shadow">
          <h3 className="text-xl font-bold text-[#15345b]">최근 업무 현황</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <Metric label="진행 프로젝트" value="17" />
            <Metric label="검토 대기" value="9" />
            <Metric label="완료 평가" value="25" />
          </div>
          <div className="mt-6 space-y-3">
            {[
              "동부역세권 복합문화시설 AI 분석 결과 확인",
              "서부 수변공원 공공디자인심의 자료 업로드",
              "남부 생활SOC 복합센터 최종 점수 검토",
            ].map((activity) => (
              <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm font-semibold text-[#475569]" key={activity}>{activity}</div>
            ))}
          </div>
        </div>
      </section>
    </SaasPageShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 rounded-xl bg-[#f8fafc] px-4 py-3">
      <dt className="font-semibold text-[#64748b]">{label}</dt>
      <dd className="font-bold text-[#15345b]">{value}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#e8f1ff] p-4">
      <p className="text-sm font-bold text-[#2463b3]">{label}</p>
      <p className="mt-2 text-3xl font-black text-[#15345b]">{value}</p>
    </div>
  );
}
