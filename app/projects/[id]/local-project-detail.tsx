"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ConfirmDialog from "@/components/confirm-dialog";
import EvaluationStatusBadge from "@/components/evaluation-status-badge";
import { Badge, Eyebrow, MutedText, PageTitle, SubsectionTitle } from "@/components/typography";
import type { Project } from "@/lib/types";
import CompleteEvaluationButton from "../complete-evaluation-button";
import {
  getLocalProjects,
  trashLocalProject,
} from "../local-project-storage";
import { showToast } from "../../toast";
import LandscapeZonePanel from "./landscape-zone-panel";
import ProjectLocationEditor from "./project-location-editor";
import ProjectMetadataEditor from "./project-metadata-editor";
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
        <div className="mx-auto max-w-[1500px] rounded-2xl border border-[#d7dee8] bg-white p-8 panel-shadow">
          <MutedText>프로젝트 정보를 불러오는 중입니다.</MutedText>
        </div>
      </main>
    );
  }

  if (project === null) {
    return (
      <main className="min-h-screen bg-[#f4f7fb] px-6 py-8 text-[#172033]">
        <div className="mx-auto max-w-[1500px] rounded-2xl border border-[#d7dee8] bg-white p-8 panel-shadow">
          <PageTitle>프로젝트를 찾을 수 없습니다.</PageTitle>
          <MutedText className="mt-2">브라우저 저장소 또는 서버 저장소에 해당 프로젝트가 없습니다.</MutedText>
          <Link className="primary-action-blue mt-5 inline-flex rounded-lg px-4 py-2 text-sm font-bold" href="/projects">
            프로젝트 관리로 이동
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <div className="mx-auto max-w-[1500px] px-6 pt-8">
        <div className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <Eyebrow>사업명</Eyebrow>
                <EvaluationStatusBadge project={project} />
              </div>
              <PageTitle className="mt-2">{project.name}</PageTitle>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 transition hover:bg-red-100"
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                휴지통으로 이동
              </button>
              <ConfirmDialog
                description={`"${project.name}" 프로젝트를 휴지통으로 이동합니다. 평가 진행 중이어도 이동할 수 있으며, 휴지통에서 복원하거나 영구 삭제할 수 있습니다.`}
                loading={deleting}
                open={deleteConfirmOpen}
                onCancel={() => {
                  if (!deleting) setDeleteConfirmOpen(false);
                }}
                onConfirm={() => {
                  setDeleting(true);
                  trashLocalProject(project.id);
                  setDeleteConfirmOpen(false);
                  showToast({ message: "프로젝트가 휴지통으로 이동했습니다.", tone: "success" });
                  window.setTimeout(() => {
                    window.location.href = "/projects";
                  }, 650);
                }}
              />
              <CompleteEvaluationButton project={project} onUpdated={setProject} />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1500px] space-y-8 px-6 py-8">
        <section className="space-y-5">
          <Panel title="프로젝트 개요" action="브라우저 저장 프로젝트">
            <ProjectMetadataEditor project={project} onUpdated={setProject} />
            <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <Info label="사업명" value={project.name} />
              <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4 sm:col-span-2">
                <Eyebrow>사업위치</Eyebrow>
                <p className="mt-2 font-semibold leading-6 text-[#172033]">{project.location}</p>
                <ProjectLocationEditor project={project} onUpdated={setProject} />
              </div>
              <Info label="시행자" value={project.client} />
              <Info label="설계자" value={project.designer} />
              <Info label="사업유형" value={project.projectType} />
              <Info label="규모" value={project.scale} />
              <Info label="심의종류" value={project.reviewType} />
              <Info label="접수일" value={project.receivedAt} />
              <Info label="상태" value={project.status} />
              {project.summary ? (
                <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4 sm:col-span-2">
                  <Eyebrow>사업개요</Eyebrow>
                  <p className="mt-2 whitespace-pre-wrap font-semibold leading-6 text-[#172033]">{project.summary}</p>
                </div>
              ) : null}
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
        <SubsectionTitle>{title}</SubsectionTitle>
        {action ? <Badge className="bg-[#e8f1ff] text-[#2463b3]">{action}</Badge> : null}
      </div>
      {children}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4">
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-2 font-semibold leading-6 text-[#172033]">{value}</p>
    </div>
  );
}
