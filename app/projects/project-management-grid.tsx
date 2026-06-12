"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CardTitle, Eyebrow } from "@/components/typography";
import EvaluationStatusBadge from "@/components/evaluation-status-badge";
import { getProjectEvaluationStatus } from "@/lib/project-evaluation-status";
import { sortProjectsByUpdatedAt } from "@/lib/project-sort";
import type { Project } from "@/lib/types";
import { mergeProjectWithLocal } from "@/lib/merge-project-state";
import { filterActiveProjects } from "@/lib/trash";
import { getLocalProjects } from "./local-project-storage";

type ProjectManagementGridProps = {
  serverProjects: Project[];
  query: string;
};

export default function ProjectManagementGrid({ serverProjects, query }: ProjectManagementGridProps) {
  const [localProjects, setLocalProjects] = useState<Project[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setLocalProjects(getLocalProjects());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  const allProjects = useMemo(() => {
    const localById = new Map(localProjects.map((project) => [project.id, project]));
    const mergedServer = serverProjects.map((project) => {
      const local = localById.get(project.id);
      return local ? mergeProjectWithLocal(project, local) : project;
    });
    const serverIds = new Set(serverProjects.map((project) => project.id));
    const localOnly = localProjects.filter((project) => !serverIds.has(project.id));
    return filterActiveProjects(sortProjectsByUpdatedAt([...mergedServer, ...localOnly]));
  }, [localProjects, serverProjects]);

  const visibleProjects = useMemo(() => {
    if (!normalizedQuery) return allProjects;

    return allProjects.filter((project) =>
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
  }, [allProjects, normalizedQuery]);

  if (!hydrated && serverProjects.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d7dee8] bg-white p-8 text-center text-sm font-semibold text-[#64748b] xl:col-span-3">
        프로젝트 목록을 불러오는 중입니다.
      </div>
    );
  }

  if (allProjects.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d7dee8] bg-white p-8 text-center text-sm text-[#64748b] xl:col-span-3">
        등록된 프로젝트가 없습니다.{" "}
        <Link className="font-bold text-[#2463b3]" href="/projects/new">
          새 프로젝트 등록
        </Link>
      </div>
    );
  }

  if (visibleProjects.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d7dee8] bg-white p-8 text-center text-sm font-semibold text-[#64748b] xl:col-span-3">
        “{query}” 검색 조건에 맞는 프로젝트가 없습니다.{" "}
        <Link className="font-bold text-[#2463b3]" href="/projects">
          전체 목록 보기
        </Link>
      </div>
    );
  }

  return (
    <>
      {visibleProjects.map((project) => (
        <article
          className="flex h-full flex-col rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow transition hover:-translate-y-0.5 hover:border-[#2463b3]"
          key={project.id}
        >
          <Link href={`/projects/${project.id}`} className="flex h-full flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Eyebrow className="text-[#2463b3] tracking-[0.16em]">{project.reviewType}</Eyebrow>
                <CardTitle className="mt-3">{project.name}</CardTitle>
              </div>
              <EvaluationStatusBadge project={project} />
            </div>
            <dl className="mt-5 flex-1 space-y-3 text-sm text-[#475569]">
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
