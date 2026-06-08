import { getDashboardPageData } from "@/lib/dashboard-data";
import DashboardOverview from "./dashboard-overview";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { projects, roles } = await getDashboardPageData();

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto max-w-[1500px] space-y-8 px-6 py-8">
        <DashboardOverview serverProjects={projects} roles={roles} />
      </div>
    </main>
  );
}
