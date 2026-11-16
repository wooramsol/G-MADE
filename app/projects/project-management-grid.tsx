"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CardTitle, Eyebrow } from "@/components/typography";
import { projectProgressStep, projectStage, projectStageStatus, STAGE_LABELS, STAGE_ORDER } from "@/lib/roles";
import { sortProjectsByUpdatedAt } from "@/lib/project-sort";
import { filterActiveProjects } from "@/lib/trash";
import type { Project } from "@/lib/types";

type ProjectManagementGridProps = {
  serverProjects: Project[];
  query: string;
  /** 목록 끝의 추가 칸에 쓸 문구 (공무원: 새 프로젝트 추가 / 지원자: 새 심의 신청) */
  addLabel: string;
};

export default function ProjectManagementGrid({ serverProjects, query, addLabel }: ProjectManagementGridProps) {
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

  // 검색 결과가 없을 때만 안내문 — 프로젝트가 아직 없으면 추가 칸 하나만 보여준다
  if (visibleProjects.length === 0 && normalizedQuery) {
    return (
      <p className="col-span-full rounded-md border border-dashed border-[#d7dee8] bg-[#f8fafc] px-4 py-8 text-center text-sm text-[#64748b]">
        검색 결과가 없습니다.
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
              <span className="shrink-0 rounded-full bg-[#eef4fb] px-2.5 py-1 text-xs font-bold text-[#2463b3]">
                {projectStageStatus(project)}
              </span>
            </div>
            <StageProgress project={project} />
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
      {/* 목록 끝의 빈 칸 — 프로젝트가 한 칸씩 추가된다는 것을 보여준다 (검색 중에는 숨김) */}
      {normalizedQuery ? null : (
        <Link
          className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-[#9db6d8] bg-[#f8fbff] p-5 text-[#2463b3] transition hover:border-[#2463b3] hover:bg-[#f0f7ff]"
          href="/projects/new"
        >
          <span aria-hidden="true" className="text-4xl font-light leading-none">
            +
          </span>
          <span className="text-base font-bold">{addLabel}</span>
        </Link>
      )}
    </>
  );
}

/** 5단계 진행 막대 — 지난 단계는 남색, 현재 단계는 파랑(반려·철회는 빨강), 남은 단계는 회색 */
function StageProgress({ project }: { project: Project }) {
  const stage = projectStage(project);
  const current = projectProgressStep(project);
  const ended = stage === "REJECTED" || stage === "WITHDRAWN";
  const closed = stage === "CLOSED";
  return (
    <ol aria-label={`진행 단계 ${current}/5 · ${projectStageStatus(project)}`} className="mt-4 grid grid-cols-5 gap-1.5">
      {STAGE_ORDER.map((entry, index) => {
        const step = index + 1;
        const done = step < current || closed;
        const isCurrent = step === current && !closed;
        return (
          <li key={entry}>
            <span
              className={`block h-1.5 rounded-full ${
                done ? "bg-[#15345b]" : isCurrent ? (ended ? "bg-[#dc2626]" : "bg-[#2463b3]") : "bg-[#e2e8f0]"
              }`}
            />
            <span
              className={`mt-1.5 block truncate text-xs leading-4 ${
                isCurrent ? (ended ? "font-bold text-[#b91c1c]" : "font-bold text-[#2463b3]") : done ? "font-semibold text-[#475569]" : "text-[#94a3b8]"
              }`}
            >
              {STAGE_LABELS[entry]}
            </span>
          </li>
        );
      })}
    </ol>
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
