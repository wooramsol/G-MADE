import { auth } from "@/auth";
import IntegrationStatusPanel from "@/components/integration-status-panel";
import { SectionDescription, SectionTitle, SubsectionTitle } from "@/components/typography";
import LoginHistoryPanel from "@/components/login-history-panel";
import { getIntegrationStatuses } from "@/lib/integrations/status";
import { getLoginHistoryForEmail } from "@/lib/login-history";
import { getRoleLabel } from "@/lib/role-labels";
import SaasPageShell from "../saas-page-shell";
import LogoutButton from "./logout-button";

export const dynamic = "force-dynamic";

export default async function MyPage() {
  const session = await auth();
  const user = session?.user;
  const initial = user?.name?.slice(0, 1) ?? "?";
  const integrations = await getIntegrationStatuses();
  const loginHistory = user?.email ? await getLoginHistoryForEmail(user.email) : [];

  return (
    <SaasPageShell
      title="내 정보"
      description="로그인된 내부 사용자의 계정 정보와 서비스 설정을 확인합니다."
    >
      <div className="space-y-8">
      <section className="grid items-stretch gap-6 xl:grid-cols-2">
        <div className="h-full rounded-2xl border border-[#d7dee8] bg-white p-6 panel-shadow">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#e8f1ff] text-2xl font-black text-[#2463b3]">
              {initial}
            </div>
            <div>
              <SubsectionTitle>{user?.name ?? "사용자"}</SubsectionTitle>
              <p className="mt-1 text-sm text-[#64748b]">
                {user?.role ? getRoleLabel(user.role) : "내부 사용자"} · G-MADE HIVE
              </p>
            </div>
          </div>
          <dl className="mt-6 space-y-3 text-sm">
            <Info label="이메일" value={user?.email ?? "-"} />
            <Info label="권한" value={user?.role ? getRoleLabel(user.role) : "-"} />
            <Info label="접근 범위" value="전체 프로젝트 공유" />
          </dl>
          <LogoutButton />
        </div>

        <div className="h-full rounded-2xl border border-[#d7dee8] bg-white p-6 panel-shadow">
          <SubsectionTitle>내부 테스트 안내</SubsectionTitle>
          <p className="type-body-muted mt-3">
            현재는 내부 시범 운영 단계로, 로그인한 모든 사용자가 동일한 프로젝트 목록과 대시보드를 공유합니다. 이메일
            인증이나 비밀번호 재설정 메일은 발송되지 않습니다.
          </p>
          <div className="mt-6 space-y-3">
            {[
              "프로젝트 등록 및 AI 분석은 전체 공유",
              "역할 기반 세부 권한은 다음 단계에서 적용 예정",
              "관리자 계정은 환경 변수 또는 DB 시드로 관리",
            ].map((activity) => (
              <div
                className="type-body rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 font-semibold"
                key={activity}
              >
                {activity}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <SectionTitle>API 연동 상태</SectionTitle>
          <SectionDescription>
            운영 서버 환경 변수 기준으로 AI, 법령, 공간정보, 데이터베이스 연동 여부를 표시합니다. 키 값 전체는
            노출하지 않습니다.
          </SectionDescription>
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4">
            {integrations.groups
              .filter((group) => group.id === "ai" || group.id === "database")
              .sort((a, b) => (a.id === "ai" ? -1 : b.id === "ai" ? 1 : 0))
              .map((group) => (
                <IntegrationStatusPanel checkedAt={integrations.checkedAt} group={group} key={group.id} />
              ))}
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            {integrations.groups
              .filter((group) => group.id !== "ai" && group.id !== "database")
              .map((group) => (
                <IntegrationStatusPanel
                  checkedAt={integrations.checkedAt}
                  group={group}
                  key={group.id}
                />
              ))}
          </div>
        </div>
      </section>

      <section>
        <Panel title="로그인 히스토리">
          <LoginHistoryPanel entries={loginHistory} />
        </Panel>
      </section>
      </div>
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

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-[#d7dee8] bg-white p-6 panel-shadow">
      <SubsectionTitle>{title}</SubsectionTitle>
      <div className="mt-5 flex flex-1 flex-col gap-3">{children}</div>
    </div>
  );
}

