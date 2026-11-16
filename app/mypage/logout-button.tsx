import { FormPendingNotice } from "@/components/blocking-notice";
import { signOut } from "@/auth";

export default function LogoutButton() {
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <FormPendingNotice label="로그아웃하는 중…" />
      <button
        className="mt-5 w-full rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 transition hover:bg-red-100"
        type="submit"
      >
        로그아웃
      </button>
    </form>
  );
}
