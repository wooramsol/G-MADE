"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import EvaluationStatusBadge from "@/components/evaluation-status-badge";
import { getProjectEvaluationStatus } from "@/lib/project-evaluation-status";
import { sortProjectsByUpdatedAt } from "@/lib/project-sort";
import type { Project } from "@/lib/types";
import { mergeProjectWithLocal } from "@/lib/merge-project-state";
import { getLocalProjects } from "./local-project-storage";

type ProjectManagementGridProps = {
  serverProjects: Project[];
  query: string;
};

export default function ProjectManagementGrid({ serverProjects, query }: ProjectManagementGridProps) {
  const [localProjects, setLocalProjects] = useState<Project[]>([]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setLocalProjects(getLocalProjects()), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleProjects = useMemo(() => {
    const localById = new Map(localProjects.map((project) => [project.id, project]));
    const mergedServer = serverProjects.map((project) => {
      const local = localById.get(project.id);
      return local ? mergeProjectWithLocal(project, local) : project;
    });
    const serverIds = new Set(serverProjects.map((project) => project.id));
    const localOnly = localProjects.filter((project) => !serverIds.has(project.id));
    const merged = sortProjectsByUpdatedAt([...mergedServer, ...localOnly]);

    if (!normalizedQuery) return merged;

    return merged.filter((project) =>
      [
        project.name,
        project.location,
        project.client,
        project.designer,
        project.projectType,
        project.reviewType,
        getProjectEvaluationStatus(project).label,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [localProjects, normalizedQuery, serverProjects]);

  if (visibleProjects.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d7dee8] bg-white p-8 text-center text-sm font-semibold text-[#64748b] xl:col-span-3">
        검색 조건에 맞는 프로젝트가 없습니다.
      </div>
    );
  }

  return (
    <>
      {visibleProjects.map((project) => (
        <article
          className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow transition hover:-translate-y-0.5 hover:border-[#2463b3]"
          key={project.id}
        >
          <Link href={`/projects/${project.id}`} className="block">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2463b3]">{project.reviewType}</p>
                <h4 className="mt-3 text-lg font-bold leading-7 text-[#15345b]">{project.name}</h4>
              </div>
              <EvaluationStatusBadge project={project} />
            </div>
            <dl className="mt-5 space-y-3 text-sm text-[#475569]">
              <Info label="사업위치" value={project.location} />
              <Info label="시행자" value={project.client} />
              <Info label="사업유형" value={project.projectType} />
              <Info label="접수일" value={project.receivedAt} />
            </dl>
            <div className="primary-action-blue mt-5 rounded-xl px-4 py-3 text-center text-sm font-bold">
              프로젝트 상세 평가로 이동
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

