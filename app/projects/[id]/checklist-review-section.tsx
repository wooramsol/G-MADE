"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import AnalysisBlockingOverlay from "@/components/analysis-blocking-overlay";
import WorkspaceSectionCard from "@/components/workspace-section-card";
import { MutedText } from "@/components/typography";
import type { ChecklistReviewProgressEvent } from "@/lib/checklist-review/progress";
import type { ChecklistReview } from "@/lib/checklist-review/types";
import { uploadProjectFilesToBlob } from "@/lib/client-blob-upload";
import { exceedsServerlessUploadLimit, SERVERLESS_UPLOAD_LIMIT_LABEL } from "@/lib/blob-config";
import { submitChecklistReviewStream } from "@/lib/client-checklist-stream";
import { ensureProjectOnServer } from "@/lib/client-ensure-project";
import type { StoredFileRef } from "@/lib/stored-file-ref";
import { buildOversizedUploadMessage, getMaxUploadFileLabel, getOversizedUploadFiles } from "@/lib/upload-limits";
import type { Project } from "@/lib/types";
import { showToast } from "../../toast";
import ChecklistReviewResults from "./checklist-review-results";
import { buildDocumentVersions, versionKeyOfReview } from "@/lib/checklist-review/document-versions";


export default function ChecklistReviewSection({
  project,
  activeVersionKey = null,
  onActiveVersionChange,
  versionPicker,
}: {
  project: Project;
  /** 도서 버전 선택 (탭 공통) — 검토 자료 선택 카드 안에 표시 */
  versionPicker?: ReactNode;
  /** 상단에서 고른 도서 버전 — 이 버전의 검토 이력만 보여준다 */
  activeVersionKey?: string | null;
  onActiveVersionChange?: (versionKey: string) => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);


  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [progress, setProgress] = useState<ChecklistReviewProgressEvent | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [liveProject, setLiveProject] = useState<Project | null>(null);

  const effectiveProject = liveProject ?? project;
  // 도서 버전별 묶음 — 이력은 선택한 버전의 검토만 (같은 제출본의 재분석 기록)
  const versions = useMemo(
    () => buildDocumentVersions(effectiveProject.checklistReviews ?? []),
    [effectiveProject.checklistReviews],
  );
  const currentVersion =
    versions.find((version) => version.key === activeVersionKey) ?? versions[versions.length - 1];
  const previousVersion = currentVersion ? versions[currentVersion.order - 2] : undefined;
  const reviews = useMemo(() => currentVersion?.reviews ?? [], [currentVersion]);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const selectedReview: ChecklistReview | undefined =
    reviews.find((review) => review.id === selectedReviewId) ?? reviews[0];
  // 비교 기준 — 이전 버전(제출본)의 최신 검토. 첫 버전이면 같은 버전의 직전 재분석.
  const previousReview: ChecklistReview | undefined = selectedReview
    ? (previousVersion?.reviews[0] ?? reviews[reviews.findIndex((review) => review.id === selectedReview.id) + 1])
    : undefined;





  const [dragActive, setDragActive] = useState(false);

  function handleFileInput(list: FileList | null) {
    if (!list || list.length === 0) return;
    // 검토 자료는 한 번에 1개만 — 새 업로드는 기존 업로드·보관 자료 선택을 대체합니다.
    const incoming = [list[0]];
    // 드래그앤드롭은 input의 accept 제한을 우회하므로 확장자를 직접 검증
    const extension = incoming[0].name.split(".").pop()?.toLowerCase() ?? "";
    if (!["pdf", "png", "jpg", "jpeg"].includes(extension)) {
      showToast({ message: "PDF 또는 이미지(PNG·JPG) 파일만 업로드할 수 있습니다.", tone: "error" });
      return;
    }
    const oversized = getOversizedUploadFiles(incoming);
    if (oversized.length > 0) {
      showToast({ message: buildOversizedUploadMessage(oversized, getMaxUploadFileLabel()), tone: "error" });
      return;
    }
    // 업로드하면 바로 검토 시작 — 같은 도서면 이전 결과를 재사용해 빠르게 끝난다
    void handleRun(incoming);
  }

  async function handleRun(newFiles: File[]) {
    const refs: StoredFileRef[] = [];
    if (newFiles.length === 0) return;

    setRunning(true);
    setStartedAt(Date.now());
    setProgress(null);
    setUploadMessage(null);
    setLastError(null);

    const newUploadBytes = newFiles.reduce((sum, file) => sum + file.size, 0);

    try {
      await ensureProjectOnServer(project);

      // Vercel 요청 본문 한도(4.5MB)를 피하기 위해 새 파일은 Blob에 먼저 업로드하고 참조만 전달합니다.
      let uploadedRefs: StoredFileRef[] = [];
      if (newFiles.length > 0) {
        setUploadMessage("자료를 저장소에 업로드하는 중...");
        uploadedRefs = await uploadProjectFilesToBlob(project, newFiles, (fileIndex, ratio) => {
          setUploadMessage(
            `자료 업로드 중 (${fileIndex + 1}/${newFiles.length}) · ${Math.round(ratio * 100)}%`,
          );
        });
        setUploadMessage(null);
      }

      const formData = new FormData();
      formData.set("projectId", project.id);
      formData.set("projectSnapshot", JSON.stringify(project));
      formData.set("fileRefs", JSON.stringify([...refs, ...uploadedRefs]));

      const result = await submitChecklistReviewStream(formData, (event) => setProgress(event));

      if (result.project) setLiveProject(result.project);
      setSelectedReviewId(result.review.id);
      onActiveVersionChange?.(versionKeyOfReview(result.review));

      const counts = result.review.counts;
      showToast({
        message: `검토 완료 — 충족 ${counts.충족} · 부분충족 ${counts.부분충족} · 미충족 ${counts.미충족} · 확인불가 ${counts.확인불가}`,
        tone: "success",
      });
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "체크리스트 검토에 실패했습니다.";
      const displayMessage =
        exceedsServerlessUploadLimit(newUploadBytes) && message.includes("Request Entity Too Large")
          ? `대용량 파일은 Blob 업로드가 필요합니다. Vercel Storage 연결을 확인해 주세요. (서버 직접 업로드 한도: ${SERVERLESS_UPLOAD_LIMIT_LABEL})`
          : message;
      setLastError(displayMessage);
      showToast({ message: displayMessage, tone: "error" });
    } finally {
      setRunning(false);
      setUploadMessage(null);
    }
  }

  return (
    <WorkspaceSectionCard
      id="checklist-review"
      title="사전심의: AI 에이전트 분석"
      bare
    >
      {running ? <AnalysisBlockingOverlay progress={progress} startedAt={startedAt} statusMessage={uploadMessage ?? undefined} /> : null}

      <div className="space-y-5">
        <div
          className={`flex flex-wrap items-center gap-4 rounded-md border px-4 py-3 transition-colors ${
            dragActive ? "border-[#2463b3] bg-[#f0f7ff]" : "border-[#d7dee8] bg-white"
          }`}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragActive(false);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            handleFileInput(event.dataTransfer.files);
          }}
        >
          <div className="min-w-0 flex-1">{versionPicker}</div>
          <button
            className={`flex h-16 w-full shrink-0 flex-col items-center justify-center rounded-md border-2 border-dashed px-4 text-center transition-colors sm:w-[320px] disabled:cursor-not-allowed disabled:opacity-60 ${
              dragActive ? "border-[#2463b3] bg-[#eaf2fd]" : "border-[#9db6d8] bg-[#f8fbff] hover:bg-[#f0f7ff]"
            }`}
            disabled={running}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <span className="text-sm font-bold text-[#2463b3]">
              {running ? "검토 중..." : dragActive ? "여기에 놓으면 바로 검토합니다" : "+ PDF 업로드 또는 드래그"}
            </span>
            <span className="text-[11px] text-[#64748b]">최대 {getMaxUploadFileLabel()}</span>
          </button>
          <input
            accept=".pdf,.png,.jpg,.jpeg"
            className="hidden"
            onChange={(event) => {
              handleFileInput(event.target.files);
              event.target.value = "";
            }}
            ref={fileInputRef}
            type="file"
          />
          {lastError ? (
            <p className="basis-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700">
              {lastError}
            </p>
          ) : null}
        </div>

        <div className="min-w-0">
          {selectedReview ? (
            <ChecklistReviewResults previousReview={previousReview} projectId={project.id} review={selectedReview} />
          ) : (
            <div className="flex h-full min-h-[280px] items-center justify-center rounded-md border border-dashed border-[#d7dee8] bg-[#f8fafc]">
              <MutedText>
                아직 검토 기록이 없습니다. 체크리스트가 포함된 PDF를 선택하고 검토를 시작하세요.
              </MutedText>
            </div>
          )}
        </div>
      </div>
    </WorkspaceSectionCard>
  );
}

