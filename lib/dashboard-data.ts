import { roles as demoRoles } from "./demo-data";
import { buildDashboardStats, getRecentProjects, mergeManagedProjects } from "./dashboard-projects";
import { getAllProjects } from "./project-store";
import { getPrismaClient, isDatabaseAvailable } from "./prisma";
import type { Project } from "./types";

export type { DashboardStats } from "./dashboard-projects";

export type DashboardRole = {
  code: string;
  label: string;
  authority: string;
};

export type DashboardPageData = {
  projects: Project[];
  stats: ReturnType<typeof buildDashboardStats>;
  recentProjects: Project[];
  roles: DashboardRole[];
};

export async function getDashboardPageData(): Promise<DashboardPageData> {
  const projects = await getAllProjects();
  const roles = (await isDatabaseAvailable()) ? await getDatabaseRoles() : demoRoles.map(mapDemoRole);

  return {
    projects,
    stats: buildDashboardStats(projects),
    recentProjects: getRecentProjects(projects),
    roles,
  };
}

async function getDatabaseRoles(): Promise<DashboardRole[]> {
  const prisma = getPrismaClient();
  if (!prisma) return demoRoles.map(mapDemoRole);

  try {
    const records = await prisma.role.findMany({
      orderBy: { code: "asc" },
    });

    if (records.length === 0) return demoRoles.map(mapDemoRole);

    return records.map((role) => ({
      code: role.code,
      label: role.name,
      authority: role.description,
    }));
  } catch {
    return demoRoles.map(mapDemoRole);
  }
}

function mapDemoRole(role: (typeof demoRoles)[number]): DashboardRole {
  return {
    code: role.code,
    label: role.label,
    authority: role.authority,
  };
}

export { mergeManagedProjects, buildDashboardStats, getRecentProjects };
