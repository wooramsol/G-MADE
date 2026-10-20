import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageTitle, SectionDescription, SubsectionTitle } from "@/components/typography";
import { getRoleLabel } from "@/lib/role-labels";
import { formatPhone, listAccounts } from "@/lib/user-accounts";
import { toggleAccountAction } from "./actions";
import { CreateOfficerForm, DeleteApplicantButton, ResetPasswordForm } from "./account-forms";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/projects");
  const accounts = await listAccounts();

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto max-w-[1500px] space-y-6 px-6 py-8">
        <div>
          <PageTitle>계정 관리</PageTitle>
          <SectionDescription>
            공무원 계정은 여기서 발급합니다. 지원자는 로그인 화면의 &lsquo;지원자 회원가입&rsquo;으로 직접 가입합니다.
          </SectionDescription>
        </div>

        <section className="rounded-md border border-[#d7dee8] bg-white p-5 panel-shadow">
          <SubsectionTitle>공무원 계정 발급</SubsectionTitle>
          <div className="mt-4">
            <CreateOfficerForm />
          </div>
        </section>

        <section className="rounded-md border border-[#d7dee8] bg-white p-5 panel-shadow">
          <SubsectionTitle>전체 계정 {accounts.length}개</SubsectionTitle>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="border-b border-[#e2e8f0] text-xs text-[#64748b]">
                <tr>
                  <th className="py-2 pr-3">이름</th>
                  <th className="py-2 pr-3">이메일</th>
                  <th className="py-2 pr-3">휴대폰</th>
                  <th className="py-2 pr-3">구분</th>
                  <th className="py-2 pr-3">가입일</th>
                  <th className="py-2 pr-3">상태</th>
                  <th className="py-2">비밀번호</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr className="border-b border-[#f1f5f9]" key={account.id}>
                    <td className="py-2.5 pr-3 font-semibold">{account.name}</td>
                    <td className="py-2.5 pr-3 text-[#475569]">{account.email}</td>
                    <td className="py-2.5 pr-3 text-[#475569]">{formatPhone(account.phone) || "—"}</td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`rounded-[3px] px-2 py-0.5 text-xs font-bold ${
                          account.role === "APPLICANT" ? "bg-[#fff8ed] text-[#b45309]" : "bg-[#e8f1ff] text-[#2463b3]"
                        }`}
                      >
                        {getRoleLabel(account.role)}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-[#64748b]">{account.createdAt.slice(0, 10)}</td>
                    <td className="py-2.5 pr-3">
                      <form action={toggleAccountAction}>
                        <input name="id" type="hidden" value={account.id} />
                        <input name="active" type="hidden" value={account.active ? "0" : "1"} />
                        <button
                          className={`rounded-md border px-2 py-1 text-xs font-bold ${
                            account.active ? "border-[#bbf7d0] text-[#047857]" : "border-[#fecaca] text-[#b91c1c]"
                          }`}
                          title={account.active ? "누르면 사용 중지" : "누르면 다시 사용"}
                          type="submit"
                        >
                          {account.active ? "사용 중" : "중지됨"}
                        </button>
                      </form>
                    </td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <ResetPasswordForm id={account.id} />
                        {account.role === "APPLICANT" ? <DeleteApplicantButton id={account.id} name={account.name} /> : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {accounts.length === 0 ? (
                  <tr>
                    <td className="py-6 text-center text-[#94a3b8]" colSpan={7}>
                      아직 발급·가입된 계정이 없습니다.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
