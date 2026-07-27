"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import AnalysisBlockingOverlay from "@/components/analysis-blocking-overlay";
import WorkspaceSectionCard from "@/components/workspace-section-card";
import { Caption, MutedText } from "@/components/typography";
import type { ChecklistReviewProgressEvent } from "@/lib/checklist-review/progress";
import { CHECKLIST_ITEM_STATUSES, type ChecklistItemStatus, type ChecklistReview } from "@/lib/checklist-review/types";
import { uploadProjectFilesToBlob } from "@/lib/client-blob-upload";
import { exceedsServerlessUploadLimit, SERVERLESS_UPLOAD_LIMIT_LABEL } from "@/lib/blob-config";
import { submitChecklistReviewStream } from "@/lib/client-checklist-stream";
import { ensureProjectOnServer } from "@/lib/client-ensure-project";
import type { StoredFileRef } from "@/lib/stored-file-ref";
import { formatBytes } from "@/lib/format-bytes";
import { formatUploadDateTime } from "@/lib/format-datetime";
import { collectProjectStoredFiles } from "@/lib/project-file-pool";
import { buildOversizedUploadMessage, getMaxUploadFileLabel, getOversizedUploadFiles } from "@/lib/upload-limits";
import type { Project } from "@/lib/types";
import { showToast } from "../../toast";
import ChecklistReviewResults from "./checklist-review-results";

/** 검토 이력 목록의 상태별 건수 태그 색상 (결과 화면 배지와 동일 톤). */
const HISTORY_COUNT_STYLES: Record<ChecklistItemStatus, string> = {
  충족: "bg-emerald-50 text-emerald-700",
  부분충족: "bg-amber-50 text-amber-700",
  미충족: "bg-red-50 text-red-700",
  확인불가: "bg-slate-100 text-slate-600",
};

export default function ChecklistReviewSection({ project }: { project: Project }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const storedFiles = useMemo(() => collectProjectStoredFiles(project), [project]);
  const [selectedStoredIds, setSelectedStoredIds] = useState<Set<string>>(new Set());
  const [newFiles, setNewFiles] = useState<File[]>([]);

  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [progress, setProgress] = useState<ChecklistReviewProgressEvent | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [liveProject, setLiveProject] = useState<Project | null>(null);

  const effectiveProject = liveProject ?? project;
  const reviews = useMemo(
    () =>
      [...(effectiveProject.checklistReviews ?? [])].sort(
        (left, right) => new Date(right.reviewedAt).getTime() - new Date(left.reviewedAt).getTime(),
      ),
    [effectiveProject.checklistReviews],
  );
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null);
  const selectedReview: ChecklistReview | undefined =
    reviews.find((review) => review.id === selectedReviewId) ?? reviews[0];

  async function handleDeleteReview(reviewId: string) {
    if (!window.confirm("이 검토 기록을 삭제할까요? 삭제 후에는 되돌릴 수 없습니다.")) return;

    setDeletingReviewId(reviewId);
    try {
      const response = await fetch("/api/checklist-reviews", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, reviewId }),
      });
      const payload = (await response.json().catch(() => ({}))) as { project?: Project | null; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "검토 기록 삭제에 실패했습니다.");
      }

      if (payload.project) setLiveProject(payload.project);
      if (selectedReviewId === reviewId) setSelectedReviewId(null);
      showToast({ message: "검토 기록을 삭제했습니다.", tone: "success" });
      router.refresh();
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "검토 기록 삭제에 실패했습니다.",
        tone: "error",
      });
    } finally {
      setDeletingReviewId(null);
    }
  }

  function toggleStoredFile(id: string) {
    setSelectedStoredIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleFileInput(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const oversized = getOversizedUploadFiles(incoming);
    if (oversized.length > 0) {
      showToast({ message: buildOversizedUploadMessage(oversized, getMaxUploadFileLabel()), tone: "error" });
      return;
    }
    setNewFiles((current) => {
      const names = new Set(current.map((file) => file.name));
      return [...current, ...incoming.filter((file) => !names.has(file.name))];
    });
  }

  async function handleRun() {
    const refs = storedFiles.filter((file) => selectedStoredIds.has(file.id));
    if (refs.length === 0 && newFiles.length === 0) {
      showToast({ message: "검토할 자료를 선택하거나 업로드해 주세요.", tone: "error" });
      return;
    }

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
      setNewFiles([]);
      setSelectedStoredIds(new Set());

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
      description="PDF 안의 '체크리스트' 페이지를 인식해 항목별 충족 여부를 AI가 평가합니다. 도면·이미지 속 내용과 법령(국가법령정보센터)·공간정보(브이월드)를 근거로 사용합니다."
      id="checklist-review"
      title="사전 검토자료 체크리스트 AI 검토"
    >
      {running ? <AnalysisBlockingOverlay progress={progress} startedAt={startedAt} statusMessage={uploadMessage ?? undefined} /> : null}

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4">
            <p className="text-sm font-bold text-[#15345b]">검토 자료 선택</p>
            <Caption className="mt-1 text-[#64748b]">
              체크리스트가 포함된 PDF를 업로드하거나 이전에 올린 자료를 선택하세요.
            </Caption>

            <button
              className="mt-3 w-full rounded-lg border border-dashed border-[#9db6d8] bg-white px-4 py-3 text-sm font-bold text-[#2463b3] hover:bg-[#f0f7ff]"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              + PDF·이미지 업로드 (최대 {getMaxUploadFileLabel()})
            </button>
            <input
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
              multiple
              onChange={(event) => {
                handleFileInput(event.target.files);
                event.target.value = "";
              }}
              ref={fileInputRef}
              type="file"
            />

            {newFiles.length > 0 ? (
              <ul className="mt-3 space-y-1.5">
                {newFiles.map((file) => (
                  <li
                    className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs"
                    key={file.name}
                  >
                    <span className="min-w-0 truncate font-semibold text-[#172033]">{file.name}</span>
                    <span className="flex shrink-0 items-center gap-2 text-[#64748b]">
                      {formatBytes(file.size)}
                      <button
                        className="font-bold text-red-600 hover:underline"
                        onClick={() => setNewFiles((current) => current.filter((item) => item.name !== file.name))}
                        type="button"
                      >
                        제거
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {storedFiles.length > 0 ? (
              <div className="mt-4">
                <Caption className="font-bold text-[#475569]">보관 중인 자료</Caption>
                <ul className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
                  {storedFiles.map((file) => (
                    <li key={file.id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs hover:bg-[#f0f7ff]">
                        <input
                          checked={selectedStoredIds.has(file.id)}
                          onChange={() => toggleStoredFile(file.id)}
                          type="checkbox"
                        />
                        <span className="min-w-0 flex-1 truncate font-semibold text-[#172033]">
                          {file.originalName}
                        </span>
                        <span className="shrink-0 text-[#94a3b8]">{formatBytes(file.sizeBytes)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {lastError ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold leading-5 text-red-700">
                {lastError}
              </p>
            ) : null}
            <button
              className="primary-action-blue mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
              disabled={running}
              onClick={handleRun}
              type="button"
            >
              {running ? "검토 중..." : "체크리스트 AI 검토 시작"}
            </button>
          </div>

          {reviews.length > 0 ? (
            <div className="rounded-xl border border-[#d7dee8] bg-white p-4">
              <p className="text-sm font-bold text-[#15345b]">검토 이력 {reviews.length}건</p>
              <ul className="mt-2 space-y-1.5">
                {reviews.map((review) => (
                  <li className="flex items-center gap-1" key={review.id}>
                    <button
                      className={`min-w-0 flex-1 rounded-lg px-3 py-2 text-left text-xs font-semibold ${
                        selectedReview?.id === review.id
                          ? "bg-[#eef4fb] text-[#15345b]"
                          : "text-[#475569] hover:bg-[#f8fafc]"
                      }`}
                      onClick={() => setSelectedReviewId(review.id)}
                      type="button"
                    >
                      <span className="block">{formatUploadDateTime(review.reviewedAt)}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <span className="rounded-full bg-[#e8f1ff] px-1.5 py-0.5 text-[10px] font-bold text-[#2463b3]">
                          전체 {review.items.length}
                        </span>
                        {CHECKLIST_ITEM_STATUSES.map((statusName) => (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${HISTORY_COUNT_STYLES[statusName]}`}
                            key={statusName}
                          >
                            {statusName} {review.counts[statusName] ?? 0}
                          </span>
                        ))}
                      </span>
                    </button>
                    <button
                      aria-label="검토 기록 삭제"
                      className="shrink-0 rounded-lg px-2 py-2 text-xs font-bold text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={deletingReviewId !== null}
                      onClick={() => handleDeleteReview(review.id)}
                      title="검토 기록 삭제"
                      type="button"
                    >
                      {deletingReviewId === review.id ? "삭제 중" : "삭제"}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="min-w-0">
          {selectedReview ? (
            <ChecklistReviewResults projectId={project.id} review={selectedReview} />
          ) : (
            <div className="flex h-full min-h-[280px] items-center justify-center rounded-xl border border-dashed border-[#d7dee8] bg-[#f8fafc]">
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
