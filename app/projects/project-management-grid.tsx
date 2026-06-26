"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CardTitle, Eyebrow } from "@/components/typography";
import EvaluationStatusBadge from "@/components/evaluation-status-badge";
import { getProjectEvaluationStatus } from "@/lib/project-evaluation-status";
import { sortProjectsByUpdatedAt } from "@/lib/project-sort";
import { filterActiveProjects } from "@/lib/trash";
import type { Project } from "@/lib/types";

type ProjectManagementGridProps = {
  serverProjects: Project[];
  query: string;
};

export default function ProjectManagementGrid({ serverProjects, query }: ProjectManagementGridProps) {
  const normalizedQuery = query.trim().toLowerCase();

  const allProjects = useMemo(
    () => filterActiveProjects(sortProjectsByUpdatedAt(serverProjects)),
    [serverProjects],
  );

  const visibleProjects = useMemo(() => {
    if (!normalizedQuery) return allProjects;

    return allProjects.filter((project) =>
      [
        project.name,
        project.location,
        project.client,
        project.designer,
        project.reviewType,
        project.projectType,
        getProjectEvaluationStatus(project).label,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [allProjects, normalizedQuery]);

  if (visibleProjects.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[#d7dee8] bg-[#f8fafc] px-4 py-8 text-center text-sm text-[#64748b]">
        {normalizedQuery ? "검색 결과가 없습니다." : "등록된 프로젝트가 없습니다."}
      </p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {visibleProjects.map((project) => (
        <Link
          className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow transition hover:border-[#2463b3]/30 hover:shadow-md"
          href={`/projects/${project.id}`}
          key={project.id}
        >
          <div className="flex items-start justify-between gap-3">
            <Eyebrow>{project.reviewType}</Eyebrow>
            <EvaluationStatusBadge project={project} />
          </div>
          <CardTitle className="mt-3 line-clamp-2">{project.name}</CardTitle>
          <p className="mt-2 text-sm text-[#64748b]">{project.location}</p>
          <p className="mt-4 text-xs font-semibold text-[#2463b3]">접수일 {project.receivedAt}</p>
        </Link>
      ))}
    </div>
  );
}
