import SaasPageShell from "../saas-page-shell";

export default function MyPage() {
  return (
    <SaasPageShell
      eyebrow="Account"
      title="내 정보"
      description="로그인된 MVP 사용자의 계정 정보, 최근 활동, 서비스 설정을 한 화면에서 확인합니다."
    >
      <section className="grid items-stretch gap-6 xl:grid-cols-2">
        <div className="h-full rounded-2xl border border-[#d7dee8] bg-white p-6 panel-shadow">
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
          <button
            className="mt-5 w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 transition hover:bg-red-100"
            type="button"
          >
            로그아웃
          </button>
        </div>

        <div className="h-full rounded-2xl border border-[#d7dee8] bg-white p-6 panel-shadow">
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

      <section className="grid items-stretch gap-6 xl:grid-cols-2">
        <Panel title="평가 가중치 기본값">
          <SettingRow label="AI 평가 기본 비율" value="30%" />
          <SettingRow label="전문가 평가 기본 비율" value="70%" />
          <SettingRow label="프로젝트별 가중치 수정" value="허용" />
        </Panel>
        <Panel title="AI 연동 상태">
          <SettingRow label="OpenAI / ChatGPT" value="환경변수 설정 시 활성" />
          <SettingRow label="Google / Gemini" value="환경변수 설정 시 활성" />
          <SettingRow label="Anthropic / Claude" value="환경변수 설정 시 활성" />
          <SettingRow label="G-MADE HIVE / 데모 분석" value="API 키 미설정 시" />
        </Panel>
        <Panel title="알림 설정">
          <SettingRow label="신규 프로젝트 등록" value="이메일 알림" />
          <SettingRow label="심사 완료" value="대시보드 알림" />
          <SettingRow label="자료 보완 요청" value="이메일 + 화면 알림" />
        </Panel>
        <Panel title="보안 및 접근">
          <SettingRow label="관리자 승인" value="필수" />
          <SettingRow label="감사 로그" value="활성" />
          <SettingRow label="파일 접근 권한" value="프로젝트 단위" />
        </Panel>
      </section>
    </SaasPageShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-4 rounded-xl bg-[#f8fafc] px-4 py-3">
      <dt className="font-semibold text-[#64748b]">{label}</dt>
      <dd className="text-right font-bold text-[#15345b]">{value}</dd>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="h-full rounded-xl bg-[#e8f1ff] p-4">
      <p className="text-sm font-bold text-[#2463b3]">{label}</p>
      <p className="mt-2 text-3xl font-black text-[#15345b]">{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-[#d7dee8] bg-white p-6 panel-shadow">
      <h3 className="text-xl font-bold text-[#15345b]">{title}</h3>
      <div className="mt-5 flex flex-1 flex-col gap-3">{children}</div>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid items-center gap-3 rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm md:grid-cols-[1fr_180px]">
      <span className="font-semibold text-[#475569]">{label}</span>
      <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-center font-bold text-[#2463b3]">{value}</span>
    </div>
  );
}
