"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  MetricLabel,
  MetricValue,
  MutedText,
  SectionDescription,
  SectionTitle,
  SubsectionTitle,
} from "@/components/typography";
import EvaluationStatusBadge from "@/components/evaluation-status-badge";
import {
  buildDashboardStats,
  getRecentProjects,
  mergeManagedProjects,
} from "@/lib/dashboard-projects";
import type { DashboardRole } from "@/lib/dashboard-data";
import type { Project } from "@/lib/types";
import { getLocalProjects } from "./projects/local-project-storage";

type DashboardOverviewProps = {
  serverProjects: Project[];
  roles: DashboardRole[];
};

export default function DashboardOverview({ serverProjects, roles }: DashboardOverviewProps) {
  const [localProjects, setLocalProjects] = useState<Project[]>([]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setLocalProjects(getLocalProjects()), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const projects = useMemo(
    () => mergeManagedProjects(serverProjects, localProjects),
    [localProjects, serverProjects],
  );
  const stats = useMemo(() => buildDashboardStats(projects), [projects]);
  const recentProjects = useMemo(() => getRecentProjects(projects), [projects]);

  return (
    <>
      <section className="space-y-5">
        <div>
          <SectionTitle>전체 프로젝트 대시보드</SectionTitle>
          <SectionDescription>
            프로젝트 관리에 등록된 심의 프로젝트의 평가대기·평가 진행 현황을 한 화면에서 확인합니다.
          </SectionDescription>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="전체 프로젝트" value={stats.total.toString()} delta="등록된 심의 프로젝트" />
          <MetricCard label="평가대기 중" value={stats.waiting.toString()} delta="평가 차수 없음" />
          <MetricCard label="평가 중" value={stats.inEvaluation.toString()} delta="1건 이상 평가 진행" />
          <MetricCard label="평가완료" value={stats.completed.toString()} delta="평가완료 처리된 프로젝트" />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
      <Panel title="최근 프로젝트" action="프로젝트 관리">
        {recentProjects.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#d7dee8] bg-[#f8fafc] px-4 py-8 text-center text-sm text-[#64748b]">
            등록된 프로젝트가 없습니다.{" "}
            <Link className="font-bold text-[#2463b3]" href="/projects/new">
              새 프로젝트 등록
            </Link>
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#d7dee8]">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead className="bg-[#eef4fb] text-[#15345b]">
                <tr>
                  <th className="px-4 py-3">사업명</th>
                  <th className="px-4 py-3">심의종류</th>
                  <th className="px-4 py-3">접수일</th>
                  <th className="px-4 py-3">상태</th>
                  <th className="px-4 py-3">이동</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d7dee8] bg-white">
                {recentProjects.map((project) => (
                  <tr key={project.id}>
                    <td className="px-4 py-4 font-semibold text-[#172033]">{project.name}</td>
                    <td className="px-4 py-4 text-[#64748b]">{project.reviewType}</td>
                    <td className="px-4 py-4 text-[#64748b]">{project.receivedAt}</td>
                    <td className="px-4 py-4">
                      <EvaluationStatusBadge project={project} />
                    </td>
                    <td className="px-4 py-4">
                      <Link className="font-bold text-[#2463b3]" href={`/projects/${project.id}`}>
                        상세 보기
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 text-sm text-[#64748b]">
          전체 {stats.total}건 ·{" "}
          <Link className="font-bold text-[#2463b3]" href="/projects">
            프로젝트 관리에서 전체 보기
          </Link>
        </p>
      </Panel>

      <Panel title="사용자 권한 체계" action="역할별 접근">
        <div className="space-y-3">
          {roles.map((role) => (
            <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4" key={role.code}>
              <p className="font-bold text-[#15345b]">{role.label}</p>
              <p className="mt-1 text-sm leading-6 text-[#64748b]">{role.authority}</p>
            </div>
          ))}
        </div>
      </Panel>
      </section>
    </>
  );
}

function Panel({ title, action, children }: { title: string; action?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
      <div className="mb-5 flex items-center justify-between gap-4">
        <SubsectionTitle>{title}</SubsectionTitle>
        {action ? (
          action === "프로젝트 관리" ? (
            <Link className="type-badge rounded-full bg-[#e8f1ff] px-3 py-1 text-[#2463b3]" href="/projects">
              {action}
            </Link>
          ) : (
            <Badge className="bg-[#e8f1ff] text-[#2463b3]">{action}</Badge>
          )
        ) : null}
      </div>
      {children}
    </div>
  );
}

function MetricCard({ label, value, delta }: { label: string; value: string; delta: string }) {
  return (
    <div className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
      <MetricLabel>{label}</MetricLabel>
      <MetricValue className="mt-3">{value}</MetricValue>
      <p className="type-body-muted mt-3 text-[#2463b3]">{delta}</p>
    </div>
  );
}

