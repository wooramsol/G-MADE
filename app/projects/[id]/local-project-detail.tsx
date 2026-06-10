"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import type { Project } from "@/lib/types";
import {
  deleteLocalProject,
  getLocalProjects,
} from "../local-project-storage";
import { showToast } from "../../toast";
import LandscapeZonePanel from "./landscape-zone-panel";
import ProjectLocationEditor from "./project-location-editor";
import ProjectUploadSection from "./project-upload-section";

export default function LocalProjectDetail({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null | undefined>(undefined);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setProject(getLocalProjects().find((item) => item.id === projectId) ?? null),
      0,
    );
    return () => window.clearTimeout(timeout);
  }, [projectId]);

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
              onClick={() => setDeleteConfirmOpen(true)}
            >
              프로젝트 삭제
            </button>
            <ConfirmDialog
              description={`"${project.name}" 프로젝트와 평가 결과가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.`}
              loading={deleting}
              open={deleteConfirmOpen}
              onCancel={() => {
                if (!deleting) setDeleteConfirmOpen(false);
              }}
              onConfirm={() => {
                setDeleting(true);
                deleteLocalProject(project.id);
                setDeleteConfirmOpen(false);
                showToast({ message: "프로젝트가 삭제되었습니다.", tone: "success" });
                window.setTimeout(() => {
                  window.location.href = "/projects";
                }, 650);
              }}
            />
          </div>
        </div>

        <section className="space-y-5">
          <Panel title="Project Overview" action="브라우저 저장 프로젝트">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <Info label="사업명" value={project.name} />
              <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4 sm:col-span-2">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#64748b]">사업위치</p>
                <p className="mt-2 font-semibold leading-6 text-[#172033]">{project.location}</p>
                <ProjectLocationEditor project={project} onUpdated={setProject} />
              </div>
              <Info label="시행자" value={project.client} />
              <Info label="설계자" value={project.designer} />
              <Info label="사업유형" value={project.projectType} />
              <Info label="규모" value={project.scale} />
              <Info label="심의종류" value={project.reviewType} />
              <Info label="접수일" value={project.receivedAt} />
            </div>
          </Panel>

          <LandscapeZonePanel address={project.location} locationPoint={project.locationPoint} />

          <ProjectUploadSection
            project={project}
            onProjectUpdated={() => setProject(getLocalProjects().find((item) => item.id === projectId) ?? null)}
          />
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
