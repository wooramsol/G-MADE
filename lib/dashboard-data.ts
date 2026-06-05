import { roles as demoRoles, hybridResults as demoHybridResults } from "./demo-data";
import { calculateProjectScore } from "./hybrid-evaluation";
import { getAllProjects } from "./project-store";
import { getPrismaClient, isDatabaseAvailable } from "./prisma";
import type { Project, ProjectFile } from "./types";

export type DashboardStats = {
  received: number;
  inReview: number;
  completed: number;
  total: number;
  averageScore: number;
  averageScoreSource: "hybrid_results" | "upload_analyses" | "demo";
};

export type DashboardRole = {
  code: string;
  label: string;
  authority: string;
};

export type DashboardPageData = {
  stats: DashboardStats;
  recentProjects: Project[];
  roles: DashboardRole[];
  dataSource: {
    projects: "store" | "database";
    roles: "database" | "demo";
  };
};

export async function getDashboardPageData(): Promise<DashboardPageData> {
  const dbAvailable = await isDatabaseAvailable();
  const storeProjects = await getAllProjects();
  const databaseProjects = dbAvailable ? await getDatabaseProjects() : [];

  const projects = mergeProjects(databaseProjects, storeProjects);
  const roles = dbAvailable ? await getDatabaseRoles() : demoRoles.map(mapDemoRole);
  const stats = await buildDashboardStats(projects);

  return {
    stats,
    recentProjects: sortProjectsByReceivedAt(projects).slice(0, 8),
    roles,
    dataSource: {
      projects: databaseProjects.length > 0 ? "database" : "store",
      roles: dbAvailable && roles.length > 0 ? "database" : "demo",
    },
  };
}

async function getDatabaseProjects(): Promise<Project[]> {
  const prisma = getPrismaClient();
  if (!prisma) return [];

  try {
    const records = await prisma.project.findMany({
      orderBy: { receivedAt: "desc" },
      include: {
        files: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    return records.map((record) => ({
      id: record.id,
      name: record.name,
      location: record.location,
      client: record.client,
      designer: record.designer,
      projectType: record.projectType,
      scale: record.scale,
      reviewType: record.reviewType,
      receivedAt: record.receivedAt.toISOString().slice(0, 10),
      status: mapDatabaseStatus(record.status),
      files: record.files.map((file) => ({
        id: file.id,
        fileName: file.fileName,
        fileType: file.fileType,
        analysisStatus: mapAnalysisStatus(file.analysisStatus),
        uploadedAt: file.createdAt.toISOString(),
        sizeBytes: Number(file.sizeBytes),
      })),
    }));
  } catch {
    return [];
  }
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

function mergeProjects(databaseProjects: Project[], storeProjects: Project[]): Project[] {
  const byId = new Map<string, Project>();

  [...databaseProjects, ...storeProjects].forEach((project) => {
    const existing = byId.get(project.id);
    byId.set(project.id, existing ? { ...existing, ...project, files: project.files.length > 0 ? project.files : existing.files } : project);
  });

  return sortProjectsByReceivedAt(Array.from(byId.values()));
}

async function buildDashboardStats(projects: Project[]): Promise<DashboardStats> {
  const received = projects.filter((project) => project.status === "접수").length;
  const inReview = projects.filter((project) => project.status === "심사 진행중").length;
  const completed = projects.filter((project) => project.status === "완료").length;

  const hybridAverage = await getDatabaseHybridAverageScore();
  if (hybridAverage !== null) {
    return {
      received,
      inReview,
      completed,
      total: projects.length,
      averageScore: hybridAverage,
      averageScoreSource: "hybrid_results",
    };
  }

  const uploadAverage = getUploadAnalysisAverageScore(projects);
  if (uploadAverage !== null) {
    return {
      received,
      inReview,
      completed,
      total: projects.length,
      averageScore: uploadAverage,
      averageScoreSource: "upload_analyses",
    };
  }

  return {
    received,
    inReview,
    completed,
    total: projects.length,
    averageScore: calculateProjectScore(demoHybridResults),
    averageScoreSource: "demo",
  };
}

async function getDatabaseHybridAverageScore(): Promise<number | null> {
  const prisma = getPrismaClient();
  if (!prisma) return null;

  try {
    const aggregate = await prisma.hybridResult.aggregate({
      _avg: { finalScore: true },
    });

    if (aggregate._avg.finalScore === null) return null;
    return Math.round(Number(aggregate._avg.finalScore));
  } catch {
    return null;
  }
}

function getUploadAnalysisAverageScore(projects: Project[]): number | null {
  const scores = projects.flatMap((project) =>
    (project.uploadAnalyses ?? []).flatMap((session) =>
      session.analysis.evaluationPreview.map((row) => row.score),
    ),
  );

  if (scores.length === 0) return null;
  return Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function sortProjectsByReceivedAt(projects: Project[]): Project[] {
  return [...projects].sort((left, right) => right.receivedAt.localeCompare(left.receivedAt));
}

function mapDatabaseStatus(status: "RECEIVED" | "IN_REVIEW" | "COMPLETED"): Project["status"] {
  if (status === "IN_REVIEW") return "심사 진행중";
  if (status === "COMPLETED") return "완료";
  return "접수";
}

function mapAnalysisStatus(status: "PENDING" | "ANALYZING" | "COMPLETED" | "FAILED"): ProjectFile["analysisStatus"] {
  if (status === "ANALYZING") return "분석중";
  if (status === "COMPLETED") return "완료";
  return "대기";
}

function mapDemoRole(role: (typeof demoRoles)[number]): DashboardRole {
  return {
    code: role.code,
    label: role.label,
    authority: role.authority,
  };
}
