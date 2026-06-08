"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Project, ProjectFile, UploadAnalysisSession } from "@/lib/types";
import UploadAnalyzer from "../../upload-analyzer";
import { UploadHistoryPanel } from "../../upload-panels";
import { addLocalProjectUploadAnalysis, deleteLocalProject, getLocalProjects } from "../local-project-storage";
import { showToast } from "../../toast";
import LandscapeZonePanel from "./landscape-zone-panel";

export default function LocalProjectDetail({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null | undefined>(undefined);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setProject(getLocalProjects().find((item) => item.id === projectId) ?? null),
      0,
    );
    return () => window.clearTimeout(timeout);
  }, [projectId]);

  function handleAnalysisSaved(session: UploadAnalysisSession, files: ProjectFile[]) {
    const updatedProject = addLocalProjectUploadAnalysis(projectId, session, files);
    if (updatedProject) setProject(updatedProject);
  }

  if (project === undefined) {
    return (
      <main className="min-h-screen bg-[#f4f7fb] px-6 py-8 text-[#172033]">
        <div className="mx-auto max-w-[1500px] rounded-2xl border border-[#d7dee8] bg-white p-8 panel-shadow">프로젝트 정보를 불러오는 중입니다.</div>
      </main>
    );
  }

  if (project === null) {
    return (
      <main className="min-h-screen bg-[#f4f7fb] px-6 py-8 text-[#172033]">
        <div className="mx-auto max-w-[1500px] rounded-2xl border border-[#d7dee8] bg-white p-8 panel-shadow">
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#2463b3]">Project Not Found</p>
          <h2 className="mt-2 text-2xl font-bold text-[#15345b]">프로젝트를 찾을 수 없습니다.</h2>
          <p className="mt-2 text-sm text-[#64748b]">브라우저 저장소 또는 서버 저장소에 해당 프로젝트가 없습니다.</p>
          <Link className="primary-action-blue mt-5 inline-flex rounded-lg px-4 py-2 text-sm font-bold" href="/projects">
            프로젝트 관리로 이동
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto max-w-[1500px] space-y-8 px-6 py-8">
        <div className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#2463b3]">프로젝트 상세 평가 워크스페이스</p>
              <h2 className="mt-2 text-2xl font-bold text-[#15345b]">{project.name}</h2>
            </div>
            <button
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-100"
              type="button"
              onClick={() => {
                deleteLocalProject(project.id);
                showToast({ message: "프로젝트가 삭제되었습니다.", tone: "success" });
                window.setTimeout(() => { window.location.href = "/projects"; }, 650);
              }}
            >
              프로젝트 삭제
            </button>
          </div>
        </div>

        <section className="space-y-5">
          <Panel title="Project Overview" action="브라우저 저장 프로젝트">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <Info label="사업명" value={project.name} />
              <Info label="사업위치" value={project.location} />
              <Info label="시행자" value={project.client} />
              <Info label="설계자" value={project.designer} />
              <Info label="사업유형" value={project.projectType} />
              <Info label="규모" value={project.scale} />
              <Info label="심의종류" value={project.reviewType} />
              <Info label="접수일" value={project.receivedAt} />
            </div>
          </Panel>

          <LandscapeZonePanel address={project.location} locationPoint={project.locationPoint} />

          <Panel title="프로젝트 자료 업로드 및 AI 자동 분석" action="파일 추가">
            <UploadAnalyzer
              projectId={project.id}
              savedAnalyses={project.uploadAnalyses ?? []}
              onAnalysisSaved={handleAnalysisSaved}
            />
            <UploadHistoryPanel files={project.files} />
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Panel({ title, action, children }: { title: string; action?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h3 className="text-lg font-bold text-[#15345b]">{title}</h3>
        {action ? <span className="rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-bold text-[#2463b3]">{action}</span> : null}
      </div>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#64748b]">{label}</p>
      <p className="mt-2 font-semibold leading-6 text-[#172033]">{value}</p>
    </div>
  );
}
