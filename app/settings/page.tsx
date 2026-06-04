import SaasPageShell from "../saas-page-shell";

export default function SettingsPage() {
  return (
    <SaasPageShell
      eyebrow="Workspace"
      title="설정"
      description="서비스 운영에 필요한 평가 가중치, AI 연동, 알림, 보안 설정을 관리하는 화면입니다."
    >
      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="평가 가중치 기본값">
          <SettingRow label="AI 평가 기본 비율" value="30%" />
          <SettingRow label="전문가 평가 기본 비율" value="70%" />
          <SettingRow label="프로젝트별 가중치 수정" value="허용" />
        </Panel>
        <Panel title="AI 연동 상태">
          <SettingRow label="OpenAI / ChatGPT" value="환경변수 설정 시 활성" />
          <SettingRow label="Google Gemini" value="환경변수 설정 시 활성" />
          <SettingRow label="API 키 미설정 시" value="데모 분석 모드" />
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#d7dee8] bg-white p-6 panel-shadow">
      <h3 className="text-xl font-bold text-[#15345b]">{title}</h3>
      <div className="mt-5 space-y-3">{children}</div>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm">
      <span className="font-semibold text-[#475569]">{label}</span>
      <span className="rounded-full bg-[#e8f1ff] px-3 py-1 font-bold text-[#2463b3]">{value}</span>
    </div>
  );
}
