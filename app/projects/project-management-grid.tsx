"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CardTitle, Eyebrow } from "@/components/typography";
import { projectStageStatus } from "@/lib/roles";
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
        projectStageStatus(project),
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [allProjects, normalizedQuery]);

  if (visibleProjects.length === 0) {
    return (
      <p className="col-span-full rounded-md border border-dashed border-[#d7dee8] bg-[#f8fafc] px-4 py-8 text-center text-sm text-[#64748b]">
        {normalizedQuery ? "검색 결과가 없습니다." : "등록된 프로젝트가 없습니다."}
      </p>
    );
  }

  return (
    <>
      {visibleProjects.map((project) => (
        <article
          className="flex h-full flex-col rounded-md border border-[#d7dee8] bg-white p-5 panel-shadow transition hover:-translate-y-0.5 hover:border-[#2463b3]"
          key={project.id}
        >
          <Link className="flex h-full flex-col" href={`/projects/${project.id}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Eyebrow className="tracking-[0.16em] text-[#2463b3]">{project.reviewType}</Eyebrow>
                <CardTitle className="mt-3">{project.name}</CardTitle>
              </div>
              <span className="shrink-0 rounded-full bg-[#eef4fb] px-2.5 py-1 text-[11px] font-bold text-[#2463b3]">
                {projectStageStatus(project)}
              </span>
            </div>
            <dl className="mt-5 flex-1 space-y-3 text-sm text-[#475569]">
              <Info label="사업위치" value={project.location} />
              <Info label="시행자" value={project.client} />
              <Info label="사업유형" value={project.projectType} />
              <Info label="접수일" value={project.receivedAt} />
              {project.ownerName ? <Info label="신청자" value={project.ownerName} /> : null}
            </dl>
            <div className="primary-action-blue mt-5 rounded-md px-4 py-3 text-center text-sm font-bold">
              상세 보기
            </div>
          </Link>
        </article>
      ))}
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-3">
      <dt className="font-semibold text-[#64748b]">{label}</dt>
      <dd className="font-semibold text-[#172033]">{value}</dd>
    </div>
  );
}
