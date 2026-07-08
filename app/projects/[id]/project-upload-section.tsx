"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import WorkspaceSectionCard from "@/components/workspace-section-card";
import { getProjectEvaluationRounds } from "@/lib/evaluation-rounds";
import { scrollToHybridEvaluationResults } from "@/lib/scroll-to-hybrid-evaluation-results";
import type { EvaluationRound, Project, ProjectFile } from "@/lib/types";
import ParallelEvaluationForm from "../../parallel-evaluation-form";
import ProjectEvaluationWorkspace from "./project-evaluation-workspace";
import TrashedRoundsPanel from "./trashed-rounds-panel";

export default function ProjectUploadSection({
  project,
  onProjectUpdated,
}: {
  project: Project;
  onProjectUpdated?: () => void;
}) {
  const router = useRouter();
  const [files, setFiles] = useState<ProjectFile[]>(project.files);
  const [rounds, setRounds] = useState<EvaluationRound[]>(() => getProjectEvaluationRounds(project));
  const [trashedRounds, setTrashedRounds] = useState<EvaluationRound[]>(
    () => project.trashedEvaluationRounds ?? [],
  );
  const [focusRoundId, setFocusRoundId] = useState<string | null>(null);

  // 서버에서 새 project prop이 내려오면 렌더 중에 상태를 보정한다 (캐스케이드 렌더 방지).
  const [lastSyncedProject, setLastSyncedProject] = useState(project);
  if (lastSyncedProject !== project) {
    setLastSyncedProject(project);
    setFiles(project.files);
    setRounds(getProjectEvaluationRounds(project));
    setTrashedRounds(project.trashedEvaluationRounds ?? []);
  }

  function refreshProjectData(options?: { focusRoundId?: string; scrollToResults?: boolean }) {
    onProjectUpdated?.();
    router.refresh();

    if (options?.focusRoundId) {
      setFocusRoundId(options.focusRoundId);
    }

    if (options?.scrollToResults) {
      scrollToHybridEvaluationResults();
    }
  }

  function handleRoundsChange(
    nextRounds: EvaluationRound[],
    nextFiles?: ProjectFile[],
    options?: {
      trashedEvaluationRounds?: EvaluationRound[];
      focusRoundId?: string;
      scrollToResults?: boolean;
    },
  ) {
    setRounds(nextRounds);
    if (nextFiles) setFiles(nextFiles);
    if (options?.trashedEvaluationRounds) {
      setTrashedRounds(options.trashedEvaluationRounds);
    }

    refreshProjectData({
      focusRoundId: options?.focusRoundId,
      scrollToResults: options?.scrollToResults ?? nextRounds.length > rounds.length,
    });
  }

  return (
    <div className="space-y-8">
      <WorkspaceSectionCard
        id="hybrid-evaluation-form"
        title="사전검토 자료 업로드 및 AI 분석"
        description="심의도서를 업로드하고 AI 사전검토(오류·체크리스트·법령 대조)를 실행합니다."
      >
        <ParallelEvaluationForm
          project={project}
          onRoundsChange={(nextRounds, nextFiles) =>
            handleRoundsChange(nextRounds, nextFiles ?? files, { scrollToResults: true })
          }
        />
      </WorkspaceSectionCard>

      <WorkspaceSectionCard
        id="hybrid-evaluation-results"
        title="통합 평가 결과"
        description="AI 사전검토 보조 결과(오류·체크리스트·법령)와 종합 점수를 확인합니다."
      >
        <ProjectEvaluationWorkspace
          focusRoundId={focusRoundId}
          project={project}
          rounds={rounds}
          showHeader={false}
          trashedRoundCount={trashedRounds.length}
          onFocusRoundHandled={() => setFocusRoundId(null)}
          onRoundsChange={(next, nextTrashedRounds) =>
            handleRoundsChange(next, files, { trashedEvaluationRounds: nextTrashedRounds })
          }
        />
      </WorkspaceSectionCard>

      <TrashedRoundsPanel
        project={project}
        trashedRounds={trashedRounds}
        onPurged={(nextRounds, nextTrashedRounds) =>
          handleRoundsChange(nextRounds, files, { trashedEvaluationRounds: nextTrashedRounds })
        }
        onRestored={(nextRounds, nextTrashedRounds, restoredRoundId) =>
          handleRoundsChange(nextRounds, files, {
            trashedEvaluationRounds: nextTrashedRounds,
            focusRoundId: restoredRoundId,
            scrollToResults: true,
          })
        }
      />
    </div>
  );
}
