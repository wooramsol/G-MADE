"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import WorkspaceSectionCard from "@/components/workspace-section-card";
import { getProjectEvaluationRounds } from "@/lib/evaluation-rounds";
import { mergeProjectWithLocal } from "@/lib/merge-project-state";
import { resolveProjectRounds } from "@/lib/resolve-project-rounds";
import { scrollToHybridEvaluationResults } from "@/lib/scroll-to-hybrid-evaluation-results";
import type { EvaluationRound, Project, ProjectFile } from "@/lib/types";
import ParallelEvaluationForm from "../../parallel-evaluation-form";
import { getLocalProjects, syncLocalProjectRounds } from "../local-project-storage";
import ProjectEvaluationWorkspace from "./project-evaluation-workspace";

function readMergedProject(serverProject: Project): Project {
  const localProject = getLocalProjects().find((item) => item.id === serverProject.id);
  return mergeProjectWithLocal(serverProject, localProject);
}

export default function ProjectUploadSection({
  project,
  onProjectUpdated,
}: {
  project: Project;
  onProjectUpdated?: () => void;
}) {
  const router = useRouter();
  const roundsRef = useRef<EvaluationRound[]>(getProjectEvaluationRounds(project));
  const [activeProject, setActiveProject] = useState<Project>(() =>
    typeof window === "undefined" ? project : readMergedProject(project),
  );
  const [files, setFiles] = useState<ProjectFile[]>(activeProject.files);
  const [rounds, setRounds] = useState<EvaluationRound[]>(() =>
    typeof window === "undefined"
      ? getProjectEvaluationRounds(project)
      : resolveProjectRounds({ serverProject: project }),
  );

  useEffect(() => {
    roundsRef.current = rounds;
  }, [rounds]);

  useEffect(() => {
    const localProject = getLocalProjects().find((item) => item.id === project.id);
    const mergedProject = mergeProjectWithLocal(project, localProject);

    setActiveProject(mergedProject);
    setFiles(mergedProject.files);
    setRounds((current) => {
      const next = resolveProjectRounds({
        serverProject: project,
        localProject,
        currentRounds: current.length > 0 ? current : roundsRef.current,
      });
      roundsRef.current = next;
      return next;
    });
  }, [project]);

  function syncRounds(
    nextRounds: EvaluationRound[],
    nextFiles = files,
    options?: { refresh?: boolean },
  ) {
    const addedRound = nextRounds.length > roundsRef.current.length;

    roundsRef.current = nextRounds;
    setRounds(nextRounds);
    setFiles(nextFiles);

    setActiveProject((current) => {
      const syncedProject = syncLocalProjectRounds(project.id, current, nextFiles, nextRounds);
      return { ...syncedProject, files: nextFiles, evaluationRounds: nextRounds };
    });
    onProjectUpdated?.();

    if (addedRound) {
      scrollToHybridEvaluationResults();
    }

    if (options?.refresh) {
      window.setTimeout(() => router.refresh(), 0);
    }
  }

  return (
    <div className="space-y-8">
      <WorkspaceSectionCard
        id="hybrid-evaluation-form"
        title="AI · 전문가 병행 평가 준비"
        description="공통 평가항목·배점을 설정한 뒤, AI·전문가 자료를 대칭 구조로 업로드하고 한 번에 하이브리드 평가 분석을 실행합니다."
      >
        <ParallelEvaluationForm
          project={activeProject}
          onRoundsChange={(nextRounds, nextFiles) =>
            syncRounds(nextRounds, nextFiles ?? files, { refresh: false })
          }
        />
      </WorkspaceSectionCard>

      <WorkspaceSectionCard
        id="hybrid-evaluation-results"
        title="통합 평가 결과"
        description="AI·전문가 자료를 함께 분석한 차수별 통합 결과와 종합 점수입니다."
      >
        <ProjectEvaluationWorkspace
          project={activeProject}
          rounds={rounds}
          showHeader={false}
          onRoundsChange={(next) => syncRounds(next, files, { refresh: true })}
        />
      </WorkspaceSectionCard>
    </div>
  );
}
