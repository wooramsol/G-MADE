"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { buildDocumentVersions, versionKeyOfReview } from "@/lib/checklist-review/document-versions";
import type { ChecklistReview } from "@/lib/checklist-review/types";
import { uploadProjectFilesToBlob } from "@/lib/client-blob-upload";
import { formatBytes } from "@/lib/format-bytes";
import { formatUploadDateTime } from "@/lib/format-datetime";
import { applicantSubmissionKind, applicantCanWithdraw, phaseSubmission, projectStage } from "@/lib/roles";
import type { StoredFileRef } from "@/lib/stored-file-ref";
import type { Project, ProjectStage, ReviewPhase } from "@/lib/types";
import { getMaxUploadFileLabel, getOversizedUploadFiles, buildOversizedUploadMessage } from "@/lib/upload-limits";
import { showToast } from "../../toast";
import ChecklistReviewSection from "./checklist-review-section";
import ExpertReviewSection, { type ExpertVersionInfo } from "./expert-review-section";
import ScreeningViewer from "./screening-viewer";

type StepId = 1 | 2 | 3 | 4 | 5;

const STEPS: Array<{ id: StepId; label: string; desc: string }> = [
  { id: 1, label: "도서접수", desc: "지원자 도서 제출" },
  { id: 2, label: "사전검토", desc: "도서 확인 · 유관부서 · 판정" },
  { id: 3, label: "사전심의", desc: "AI 분석 · 전문가 분석" },
  { id: 4, label: "본심의", desc: "수정 도서 · AI · 전문가" },
  { id: 5, label: "심의종료", desc: "결과 통지" },
];

function stageStep(stage: ProjectStage): StepId {
  if (stage === "RECEPTION") return 1;
  if (stage === "PRE_REVIEW") return 3;
  if (stage === "MAIN_REVIEW") return 4;
  if (stage === "CLOSED") return 5;
  return 2; // SCREENING · 반려 · 철회
}

/** 단계(사전심의/본심의)별 심사 대상 도서와 그 도서의 AI 분석 결과 */
function usePhaseDocument(project: Project, phase: ReviewPhase) {
  return useMemo(() => {
    const reviews = project.checklistReviews ?? [];
    let submission = phaseSubmission(project, phase);
    // 과거 프로젝트(접수 기록 없이 공무원이 직접 분석) — 사전심의는 가장 최근 분석 도서로
    if (!submission && phase === "pre" && reviews.length > 0) {
      const lastReview = [...reviews].sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))[0];
      const file = lastReview.files[0];
      if (file?.storageKey) {
        submission = {
          id: `review-${lastReview.id}`,
          round: 1,
          file: { id: file.id, originalName: file.originalName, fileType: file.fileType, sizeBytes: file.sizeBytes, storageKey: file.storageKey, blobUrl: file.blobUrl },
          submittedAt: lastReview.reviewedAt,
          submittedBy: { id: "", name: "", role: "OFFICER" },
        };
      }
    }
    const matching = submission
      ? reviews.filter((review) => review.files.some((file) => file.storageKey === submission.file.storageKey))
      : [];
    const latestReview: ChecklistReview | undefined = [...matching].sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt))[0];
    const pending: StoredFileRef | null =
      submission && matching.length === 0 ? { ...submission.file, uploadedAt: submission.submittedAt } : null;
    const expertVersion: ExpertVersionInfo | null = submission
      ? {
          key: `sub:${submission.id}`,
          label: phase === "pre" ? "사전심의 도서" : "본심의 수정 도서",
          order: phase === "pre" ? 1 : 2,
          fileName: submission.file.originalName.normalize("NFC"),
          reviewId: latestReview?.id ?? null,
          fileId: submission.file.id,
          changedPages: [],
        }
      : null;
    return {
      submission,
      latestReview,
      pending,
      expertVersion,
      versionKey: latestReview ? versionKeyOfReview(latestReview) : null,
    };
  }, [project, phase]);
}

/**
 * 심의 진행 — 1 도서접수 · 2 사전검토 · 3 사전심의 · 4 본심의 · 5 심의종료.
 * 지원자: 도서 제출과 진행 상태만. 공무원: 모든 단계.
 */
export default function ProjectWorkflow({ project, official }: { project: Project; official: boolean }) {
  const stage = projectStage(project);
  const currentStep = stageStep(stage);
  const [viewStep, setViewStep] = useState<StepId>(official ? currentStep : 1);
  // 판정·종료로 단계가 바뀌면 화면도 새 단계로 이동
  const [shownStep, setShownStep] = useState(currentStep);
  if (shownStep !== currentStep) {
    setShownStep(currentStep);
    if (official) setViewStep(currentStep);
  }
  const ended = stage === "REJECTED" || stage === "WITHDRAWN";

  return (
    <div className="space-y-4">
      <Stepper
        current={currentStep}
        official={official}
        onSelect={setViewStep}
        rejected={ended}
        rejectedLabel={stage === "WITHDRAWN" ? "철회" : "반려"}
        view={viewStep}
      />

      {!official ? <ApplicantStatus project={project} /> : null}

      <div
        className={`rounded-md border-2 bg-white p-5 panel-shadow ${
          viewStep >= 4 ? "border-[#111827]" : viewStep === 3 ? "border-[#2463b3]" : "border-[#15345b]"
        }`}
      >
        {viewStep === 1 || !official ? <ReceptionPanel official={official} project={project} /> : null}
        {official && viewStep === 2 ? <ScreeningPanel project={project} /> : null}
        {official ? (
          <>
            <div hidden={viewStep !== 3}>
              {currentStep >= 3 ? (
                <PhasePanel active={viewStep === 3} phase="pre" project={project} />
              ) : (
                <EmptyStep text="사전검토를 ‘통과’하면 그 도서로 사전심의(AI 분석 · 전문가 분석)를 진행합니다." />
              )}
            </div>
            <div hidden={viewStep !== 4}>
              {currentStep >= 4 ? (
                <PhasePanel active={viewStep === 4} phase="main" project={project} />
              ) : (
                <EmptyStep text="사전심의 결과를 통보하고 지원자가 수정 도서를 제출하면 본심의를 진행합니다." />
              )}
            </div>
            {viewStep === 5 ? <ClosedPanel project={project} /> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function EmptyStep({ text }: { text: string }) {
  return <p className="rounded-md border border-dashed border-[#d0d5dd] bg-[#f8fafc] px-4 py-10 text-center text-sm text-[#64748b]">{text}</p>;
}

function Stepper({
  current,
  view,
  official,
  rejected,
  rejectedLabel = "반려",
  onSelect,
}: {
  current: StepId;
  view: StepId;
  official: boolean;
  rejected: boolean;
  rejectedLabel?: string;
  onSelect: (step: StepId) => void;
}) {
  return (
    <ol className="grid grid-cols-5 gap-2.5">
      {STEPS.map((step) => {
        const done = step.id < current;
        const isCurrent = step.id === current;
        const selected = official && step.id === view;
        const reachable = official && step.id <= current;
        return (
          <li key={step.id}>
            <button
              className={`flex h-full w-full items-center gap-3 rounded-lg border-2 px-3.5 py-4 text-left transition ${
                selected
                  ? "border-[#15345b] bg-[#15345b] text-white shadow-lg"
                  : isCurrent
                    ? "border-[#2463b3] bg-[#f3f7fc] text-[#15345b]"
                    : done
                      ? "border-[#c9d6e6] bg-white text-[#15345b]"
                      : "border-[#e2e8f0] bg-[#f8fafc] text-[#94a3b8]"
              } ${reachable ? "cursor-pointer hover:border-[#2463b3]" : "cursor-default"}`}
              disabled={!reachable}
              onClick={() => onSelect(step.id)}
              type="button"
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-black ${
                  selected ? "bg-white/20" : done ? "bg-[#15345b] text-white" : isCurrent ? "bg-[#2463b3] text-white" : "bg-[#e2e8f0]"
                }`}
              >
                {done ? "✓" : step.id}
              </span>
              <span className="min-w-0">
                <span className="block text-base font-bold leading-5">
                  {step.label}
                  {isCurrent && rejected ? <span className="ml-1.5 rounded bg-red-100 px-1.5 text-[11px] text-red-700">{rejectedLabel}</span> : null}
                </span>
                <span className={`mt-0.5 block text-[11px] leading-4 ${selected ? "text-white/80" : "opacity-75"}`}>{step.desc}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** 지원자에게 보이는 진행 상태 */
function ApplicantStatus({ project }: { project: Project }) {
  const stage = projectStage(project);
  const decisions = project.preReviewDecisions ?? [];
  const last = decisions[decisions.length - 1];
  const kind = applicantSubmissionKind(project);

  let tone = "border-[#c9d6e6] bg-[#f3f7fc] text-[#15345b]";
  let title = "도서를 접수해 주세요";
  let body = "아래에서 심의 도서(PDF)를 제출하면 담당부서의 사전검토가 시작됩니다.";
  if (stage === "SCREENING") {
    if (kind === "revision") {
      tone = "border-[#f2c48d] bg-[#fff8ed] text-[#92400e]";
      title = "보완 요청이 있습니다";
      body = last?.note ?? "담당부서의 요청 사항을 반영한 보완 도서를 제출해 주세요.";
    } else {
      title = "사전검토 중";
      body = "담당부서에서 제출한 도서를 확인하고 있습니다. 보완이 필요하면 이 화면과 알림으로 안내됩니다.";
    }
  } else if (stage === "PRE_REVIEW") {
    if (kind === "main") {
      tone = "border-[#f2c48d] bg-[#fff8ed] text-[#92400e]";
      title = "사전심의가 끝났습니다 — 수정 도서를 제출해 주세요";
      body = project.preReviewNote ?? "사전심의 결과를 반영한 수정 도서를 제출하면 본심의가 진행됩니다.";
    } else {
      title = "사전심의 중";
      body = "사전검토를 통과해 AI 분석과 전문가 분석이 진행되고 있습니다. 결과는 담당부서가 안내합니다.";
    }
  } else if (stage === "MAIN_REVIEW") {
    tone = "border-[#bbf7d0] bg-[#ecfdf5] text-[#047857]";
    title = "본심의 중";
    body = "제출한 수정 도서로 본심의가 진행되고 있습니다.";
  } else if (stage === "CLOSED") {
    title = "심의가 종료되었습니다";
    body = "심의 결과는 담당부서에서 별도로 통지해 드릴 예정입니다.";
  } else if (stage === "WITHDRAWN") {
    tone = "border-[#e2e8f0] bg-[#f8fafc] text-[#475569]";
    title = "신청을 철회했습니다";
    body = "철회한 신청은 더 이상 심의가 진행되지 않습니다. 다시 신청하려면 새 심의 신청을 해 주세요.";
  } else if (stage === "REJECTED") {
    tone = "border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]";
    title = "반려되었습니다";
    body = last?.note ?? "담당 공무원에게 문의해 주세요.";
  }
  return (
    <div className={`rounded-md border px-5 py-4 ${tone}`}>
      {applicantCanWithdraw(project) ? <WithdrawButton project={project} /> : null}
      <p className="text-base font-bold">{title}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{body}</p>
    </div>
  );
}

/** 1단계 — 도서 접수·보완 제출 */
function ReceptionPanel({ project, official }: { project: Project; official: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  // 파일을 고르면 바로 제출하지 않고 확인 단계를 거친다
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const submissions = project.submissions ?? [];
  const stage = projectStage(project);
  // 지금 낼 수 있는 도서 종류 — 최초 접수 / 사전검토 보완 / 본심의용 수정 도서
  const kind = applicantSubmissionKind(project) ?? (official && (stage === "RECEPTION" || stage === "SCREENING") ? (stage === "RECEPTION" ? "initial" : "revision") : null);
  const canSubmit = kind !== null;
  const kindLabel = kind === "main" ? "본심의 수정 도서" : kind === "revision" ? "보완 도서" : "심의 도서";

  const choose = (file: File | undefined) => {
    if (!file || busy) return;
    if (!/\.pdf$/i.test(file.name)) {
      showToast({ message: "도서는 PDF 파일로 제출해 주세요.", tone: "error" });
      return;
    }
    const oversized = getOversizedUploadFiles([file]);
    if (oversized.length > 0) {
      showToast({ message: buildOversizedUploadMessage(oversized, getMaxUploadFileLabel()), tone: "error" });
      return;
    }
    setPendingFile(file);
  };

  const submit = async (file: File | null) => {
    if (!file || busy) return;
    setBusy("업로드 준비 중…");
    try {
      const [ref] = await uploadProjectFilesToBlob(project, [file], (_index, ratio) => setBusy(`업로드 중 ${Math.round(ratio * 100)}%`));
      setBusy("접수 처리 중…");
      const response = await fetch(`/api/projects/${project.id}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: ref }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "접수에 실패했습니다.");
      showToast({ message: `${kindLabel}가 제출되었습니다.`, tone: "success" });
      setPendingFile(null);
      router.refresh();
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "접수에 실패했습니다.", tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold text-[#15345b]">도서 접수</h3>
        <p className="text-xs text-[#64748b]">PDF · 최대 {getMaxUploadFileLabel()}</p>
      </div>

      {canSubmit && pendingFile ? (
        <div className="mt-4 rounded-md border-2 border-[#2463b3] bg-[#f0f7ff] p-5">
          <p className="text-base font-bold text-[#15345b]">
            {`이 ${kindLabel}를 제출하시겠습니까?`}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-[#c9d6e6] bg-white px-4 py-3 text-sm">
            <span className="rounded-[3px] bg-[#15345b] px-2 py-0.5 text-xs font-bold text-white">PDF</span>
            <span className="min-w-0 flex-1 truncate font-semibold text-[#172033]">{pendingFile.name}</span>
            <span className="text-xs text-[#64748b]">{formatBytes(pendingFile.size)}</span>
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-[#334155]">
            <li>제출한 도서는 담당부서로 전달되며, 제출 후에는 취소하거나 바꿀 수 없습니다.</li>
            <li>접수가 완료되면 알림으로 안내해 드립니다.</li>
            {kind === "revision" ? <li>보완 요청 사항이 모두 반영되었는지 다시 한 번 확인해 주세요.</li> : null}
            {kind === "main" ? <li>사전심의 결과를 반영한 수정 도서로 본심의가 진행됩니다.</li> : null}
          </ul>
          <div className="mt-4 flex justify-end gap-2">
            <button
              className="rounded-md border border-[#d7dee8] bg-white px-4 py-2.5 text-sm font-bold text-[#475569] hover:bg-[#f8fafc] disabled:opacity-50"
              disabled={Boolean(busy)}
              onClick={() => setPendingFile(null)}
              type="button"
            >
              취소
            </button>
            <button
              className="primary-action-blue rounded-md px-5 py-2.5 text-sm font-bold disabled:opacity-60"
              disabled={Boolean(busy)}
              onClick={() => void submit(pendingFile)}
              type="button"
            >
              {busy ?? "제출하기"}
            </button>
          </div>
        </div>
      ) : canSubmit ? (
        <button
          className={`mt-4 flex h-24 w-full flex-col items-center justify-center rounded-md border-2 border-dashed text-center transition ${
            drag ? "border-[#2463b3] bg-[#eaf2fd]" : "border-[#9db6d8] bg-[#f8fbff] hover:bg-[#f0f7ff]"
          } disabled:opacity-60`}
          disabled={Boolean(busy)}
          onClick={() => inputRef.current?.click()}
          onDragLeave={() => setDrag(false)}
          onDragOver={(event) => {
            event.preventDefault();
            setDrag(true);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDrag(false);
            choose(event.dataTransfer.files[0]);
          }}
          type="button"
        >
          <span className="text-base font-bold text-[#2463b3]">
            {`+ ${kindLabel} PDF 첨부 (클릭 또는 드래그)`}
          </span>
          <span className="mt-1 text-xs text-[#64748b]">
            첨부한 뒤 내용을 확인하고 제출합니다.
          </span>
        </button>
      ) : (
        <p className="mt-4 rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 text-sm text-[#64748b]">
          {stage === "RECEPTION" ? "도서를 제출할 수 없습니다." : "제출한 도서를 담당부서에서 검토하고 있습니다. 보완·수정 요청을 받으면 이곳에서 도서를 제출할 수 있습니다."}
        </p>
      )}
      <input
        accept=".pdf"
        className="hidden"
        onChange={(event) => {
          choose(event.target.files?.[0]);
          event.target.value = "";
        }}
        ref={inputRef}
        type="file"
      />

      <div className="mt-5">
        <p className="text-sm font-bold text-[#15345b]">제출 이력 {submissions.length}건</p>
        {submissions.length === 0 ? (
          <p className="mt-2 text-sm text-[#94a3b8]">아직 제출된 도서가 없습니다.</p>
        ) : (
          <ul className="mt-2 divide-y divide-[#eef1f5] rounded-md border border-[#e2e8f0]">
            {[...submissions].reverse().map((submission) => (
              <li className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm" key={submission.id}>
                <span className="rounded-[3px] bg-[#15345b] px-2 py-0.5 text-xs font-bold text-white">
                  {submission.id === project.mainReviewSubmissionId ? "본심의 수정본" : submission.round === 1 ? "최초 접수" : `${submission.round - 1}차 보완`}
                </span>
                <a
                  className="min-w-0 flex-1 truncate font-semibold !text-[#2463b3] hover:underline"
                  href={`/api/projects/${project.id}/files/${submission.file.id}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  {submission.file.originalName}
                </a>
                <span className="text-xs text-[#64748b]">{formatBytes(submission.file.sizeBytes)}</span>
                <span className="text-xs text-[#64748b]">
                  {formatUploadDateTime(submission.submittedAt)} · {submission.submittedBy.name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** 2단계 — 사전검토: 도서 직접 확인 · 유관부서 할당 · 통과/보완/반려 판정 */
function ScreeningPanel({ project }: { project: Project }) {
  const submissions = project.submissions ?? [];
  const latest = submissions[submissions.length - 1];
  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold text-[#15345b]">사전검토</h3>
        {latest ? (
          <p className="text-xs text-[#64748b]">
            검토 도서: {latest.file.originalName.normalize("NFC")} · {formatUploadDateTime(latest.submittedAt)} 접수
          </p>
        ) : null}
      </div>
      {latest ? (
        <ScreeningViewer fileId={latest.file.id} key={latest.id} projectId={project.id} />
      ) : (
        <EmptyStep text="아직 접수된 도서가 없습니다." />
      )}
      <DepartmentsEditor project={project} />
      <DecisionPanel project={project} />
    </section>
  );
}

/** 유관부서 할당 — 부서 이름 태그 */
function DepartmentsEditor({ project }: { project: Project }) {
  const [departments, setDepartments] = useState<string[]>(project.departments ?? []);
  const [value, setValue] = useState("");
  const save = async (next: string[]) => {
    const before = departments;
    setDepartments(next);
    const response = await fetch(`/api/projects/${project.id}/departments`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ departments: next }),
    }).catch(() => null);
    if (!response?.ok) {
      setDepartments(before);
      showToast({ message: "유관부서를 저장하지 못했습니다.", tone: "error" });
    }
  };
  const add = () => {
    const names = value.split(/[,\n]/).map((entry) => entry.trim()).filter(Boolean);
    setValue("");
    const next = [...departments];
    for (const name of names) if (!next.some((entry) => entry.replace(/\s+/g, "") === name.replace(/\s+/g, ""))) next.push(name);
    if (next.length !== departments.length) void save(next);
  };
  return (
    <section className="rounded-md border border-[#d7dee8] bg-white p-4">
      <p className="text-sm font-bold text-[#15345b]">유관부서 할당</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {departments.map((name) => (
          <span className="flex items-center gap-1.5 rounded-full border border-[#c9d6e6] bg-[#f3f7fc] py-1 pl-3 pr-1.5 text-sm font-semibold text-[#15345b]" key={name}>
            {name}
            <button
              aria-label={`${name} 제거`}
              className="flex h-5 w-5 items-center justify-center rounded-full text-xs text-[#64748b] hover:bg-[#fee2e2] hover:text-[#b91c1c]"
              onClick={() => void save(departments.filter((entry) => entry !== name))}
              type="button"
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="h-8 w-56 rounded-full border border-dashed border-[#9db6d8] px-3 text-sm outline-none focus:border-[#2463b3]"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              add();
            }
          }}
          placeholder="+ 부서 이름 입력 후 Enter (예: 건축과)"
          value={value}
        />
      </div>
    </section>
  );
}

/** 사전검토 판정 (공무원) */
function DecisionPanel({ project }: { project: Project }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const decisions = project.preReviewDecisions ?? [];
  const stage = projectStage(project);

  const decide = async (decision: "보완요청" | "반려" | "통과") => {
    if (decision !== "통과" && !note.trim()) {
      showToast({ message: "보완요청·반려 사유를 적어 주세요. 지원자 화면에 그대로 표시됩니다.", tone: "error" });
      return;
    }
    const confirmText =
      decision === "통과" ? "사전검토를 통과 처리하고 사전심의로 넘길까요?" : decision === "반려" ? "반려 처리할까요? 심의가 종료됩니다." : "지원자에게 보완을 요청할까요?";
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "판정을 저장하지 못했습니다.");
      setNote("");
      showToast({ message: `${decision} 처리했습니다.`, tone: "success" });
      router.refresh();
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "판정을 저장하지 못했습니다.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const reopen = async () => {
    if (!window.confirm("사전검토 단계로 되돌릴까요?")) return;
    await fetch(`/api/projects/${project.id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "SCREENING" }),
    });
    router.refresh();
  };

  return (
    <section className="rounded-md border border-[#d7dee8] bg-[#f8fafc] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-[#15345b]">사전검토 판정</h3>
        {stage !== "SCREENING" && stage !== "RECEPTION" ? (
          <button className="text-xs font-semibold text-[#64748b] underline" onClick={() => void reopen()} type="button">
            사전검토로 되돌리기
          </button>
        ) : null}
      </div>
      {stage === "SCREENING" ? (
        <>
          <textarea
            className="mt-3 h-20 w-full resize-y rounded-md border border-[#d7dee8] bg-white p-3 text-sm outline-none focus:border-[#2463b3]"
            onChange={(event) => setNote(event.target.value)}
            placeholder="보완요청·반려 사유 (지원자 화면에 표시됩니다)"
            value={note}
          />
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <button className="rounded-md border border-[#f2c48d] bg-[#fff8ed] px-4 py-2 text-sm font-bold text-[#b45309] disabled:opacity-50" disabled={busy} onClick={() => void decide("보완요청")} type="button">
              보완요청
            </button>
            <button className="rounded-md border border-[#fecaca] bg-[#fef2f2] px-4 py-2 text-sm font-bold text-[#b91c1c] disabled:opacity-50" disabled={busy} onClick={() => void decide("반려")} type="button">
              반려
            </button>
            <button className="primary-action-blue rounded-md px-4 py-2 text-sm font-bold disabled:opacity-50" disabled={busy} onClick={() => void decide("통과")} type="button">
              통과 → 사전심의
            </button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-[#475569]">
          {stage === "WITHDRAWN"
            ? "지원자가 신청을 철회했습니다."
            : stage === "REJECTED"
              ? "반려되어 심의가 종료되었습니다."
              : stage === "RECEPTION"
                ? "도서 접수 후 판정할 수 있습니다."
                : "사전검토를 통과했습니다."}
        </p>
      )}
      {decisions.length > 0 ? (
        <ul className="mt-3 space-y-1.5 border-t border-[#e2e8f0] pt-3 text-xs text-[#475569]">
          {[...decisions].reverse().map((entry) => (
            <li key={entry.id}>
              <span
                className={`mr-2 rounded-[3px] px-1.5 py-0.5 font-bold ${
                  entry.decision === "통과" ? "bg-[#ecfdf5] text-[#047857]" : entry.decision === "반려" ? "bg-[#fef2f2] text-[#b91c1c]" : "bg-[#fff8ed] text-[#b45309]"
                }`}
              >
                {entry.decision}
              </span>
              {formatUploadDateTime(entry.decidedAt)} · {entry.decidedBy.name}
              {entry.note ? <span className="ml-2 text-[#64748b]">— {entry.note}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** 3·4단계 — 사전심의 / 본심의: AI 에이전트 분석과 인간 전문가 분석을 병렬로 */
function PhasePanel({ project, phase, active }: { project: Project; phase: ReviewPhase; active: boolean }) {
  const [tab, setTab] = useState<"ai" | "expert">("ai");
  const doc = usePhaseDocument(project, phase);
  const [versionKey, setVersionKey] = useState<string | null>(null);
  const versions = useMemo(() => buildDocumentVersions(project.checklistReviews ?? []), [project.checklistReviews]);
  const phaseName = phase === "pre" ? "사전심의" : "본심의";

  if (!doc.submission) {
    return <EmptyStep text={phase === "main" ? "지원자가 수정 도서를 제출하면 본심의를 진행할 수 있습니다." : "심사할 도서가 없습니다."} />;
  }
  const stage = projectStage(project);
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold text-[#15345b]">{phaseName}</h3>
        <p className="text-xs text-[#64748b]">
          심사 도서: {doc.submission.file.originalName.normalize("NFC")} · {formatBytes(doc.submission.file.sizeBytes)} ·{" "}
          {formatUploadDateTime(doc.submission.submittedAt)} 접수
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3" role="tablist">
        {(
          [
            ["ai", "AI 에이전트 분석", doc.latestReview ? `분석 완료 · ${formatUploadDateTime(doc.latestReview.reviewedAt)}` : "분석 전"],
            ["expert", "인간 전문가 분석", "심사위원 의견"],
          ] as const
        ).map(([id, label, sub]) => (
          <button
            aria-selected={tab === id}
            className={`flex flex-col items-start rounded-lg border-2 px-5 py-3.5 text-left transition ${
              tab === id ? (id === "ai" ? "border-[#2463b3] bg-[#2463b3] text-white" : "border-[#111827] bg-[#111827] text-white") : "border-[#d7dee8] bg-white text-[#334155] hover:border-[#9fb3cc]"
            }`}
            key={id}
            onClick={() => setTab(id)}
            role="tab"
            type="button"
          >
            <span className="text-base font-bold">{label}</span>
            <span className={`text-xs ${tab === id ? "text-white/80" : "text-[#94a3b8]"}`}>{sub}</span>
          </button>
        ))}
      </div>
      <div hidden={tab !== "ai"}>
        <ChecklistReviewSection
          activeVersionKey={versionKey ?? doc.versionKey ?? versions[versions.length - 1]?.key ?? null}
          onActiveVersionChange={setVersionKey}
          pendingSubmission={doc.pending}
          project={project}
        />
      </div>
      <div hidden={tab !== "expert"}>
        <ExpertReviewSection
          active={active && tab === "expert"}
          activeVersion={doc.expertVersion}
          aiReview={doc.latestReview ?? null}
          phase={phase}
          project={project}
          versions={doc.expertVersion ? [doc.expertVersion] : []}
        />
      </div>
      {phase === "pre" && stage === "PRE_REVIEW" ? <PreReviewNotifyBar project={project} /> : null}
      {phase === "main" && stage === "MAIN_REVIEW" ? <CloseReviewBar project={project} /> : null}
    </section>
  );
}

/** 사전심의 마무리 — 결과 통보(지원자에게 수정 도서 제출 요청) */
function PreReviewNotifyBar({ project }: { project: Project }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (project.preReviewNotifiedAt) {
    return (
      <div className="rounded-md border border-[#f2c48d] bg-[#fff8ed] px-4 py-3 text-sm text-[#92400e]">
        {formatUploadDateTime(project.preReviewNotifiedAt)}에 사전심의 결과를 통보했습니다. 지원자가 수정 도서를 제출하면 본심의로 넘어갑니다.
        {project.preReviewNote ? <span className="mt-1 block text-xs text-[#b45309]">안내: {project.preReviewNote}</span> : null}
      </div>
    );
  }
  const notify = async () => {
    if (!window.confirm("사전심의를 마치고 지원자에게 결과를 통보할까요?\n지원자에게 수정 도서 제출 요청 알림이 갑니다.")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifyPreReview: true, note }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "처리하지 못했습니다.");
      showToast({ message: "사전심의 결과를 통보했습니다.", tone: "success" });
      router.refresh();
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "처리하지 못했습니다.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-md border border-[#e2e8f0] bg-[#f8fafc] p-4">
      <p className="text-sm font-bold text-[#15345b]">사전심의 결과 통보</p>
      <p className="mt-1 text-xs text-[#64748b]">AI 분석과 전문가 의견을 정리해 지원자에게 전달한 뒤 통보하세요. 지원자가 수정 도서를 내면 본심의가 시작됩니다.</p>
      <textarea
        className="mt-2 h-16 w-full resize-y rounded-md border border-[#d7dee8] bg-white p-2.5 text-sm outline-none focus:border-[#2463b3]"
        onChange={(event) => setNote(event.target.value)}
        placeholder="지원자에게 보일 안내 (선택) — 예: 첨부한 사전심의 의견을 반영해 수정 도서를 제출해 주세요."
        value={note}
      />
      <div className="mt-2 flex justify-end">
        <button className="rounded-md bg-[#15345b] px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={busy} onClick={() => void notify()} type="button">
          사전심의 종료 · 결과 통보
        </button>
      </div>
    </div>
  );
}

/** 본심의 마무리 — 심의 종료 (지원자에게 결과 통지 예정 안내) */
function CloseReviewBar({ project }: { project: Project }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const close = async () => {
    if (!window.confirm("본심의를 마치고 심의를 종료할까요?\n지원자에게 '심의 결과는 별도로 통지할 예정'이라는 알림이 갑니다.")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "CLOSED" }),
      });
      if (!response.ok) throw new Error("처리하지 못했습니다.");
      showToast({ message: "심의를 종료했습니다.", tone: "success" });
      router.refresh();
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "처리하지 못했습니다.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
      <p className="text-sm text-[#475569]">본심의 AI 분석과 심사위원 의견 입력을 마쳤으면 심의를 종료하세요. 지원자에게 결과 통지 예정 안내가 전달됩니다.</p>
      <button className="rounded-md bg-[#111827] px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={busy} onClick={() => void close()} type="button">
        본심의 종료 → 심의종료
      </button>
    </div>
  );
}

/** 5단계 — 심의 종료 */
function ClosedPanel({ project }: { project: Project }) {
  const router = useRouter();
  const reopen = async () => {
    if (!window.confirm("본심의 단계로 되돌릴까요?")) return;
    await fetch(`/api/projects/${project.id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "MAIN_REVIEW" }),
    });
    router.refresh();
  };
  return (
    <section className="py-6 text-center">
      <p className="text-lg font-bold text-[#15345b]">심의가 종료되었습니다</p>
      <p className="mt-2 text-sm text-[#475569]">지원자에게 &lsquo;심의 결과는 별도로 통지할 예정&rsquo;이라는 안내가 전달되었습니다.</p>
      <p className="mt-1 text-sm text-[#475569]">사전심의·본심의 결과는 각 단계에서 계속 확인·다운로드할 수 있습니다.</p>
      <button className="mt-4 text-xs font-semibold text-[#64748b] underline" onClick={() => void reopen()} type="button">
        본심의로 되돌리기
      </button>
    </section>
  );
}

/** 지원자 — 신청 취소(접수 전) / 신청 철회(접수 후) */
function WithdrawButton({ project }: { project: Project }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const submitted = (project.submissions ?? []).length > 0;
  const run = async () => {
    const message = submitted
      ? "심의 신청을 철회할까요?\n철회하면 심의가 더 이상 진행되지 않으며 되돌릴 수 없습니다. 담당부서에 철회 사실이 전달됩니다."
      : "아직 도서를 제출하지 않은 신청입니다. 신청을 취소하고 목록에서 지울까요?";
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/withdraw`, { method: "POST" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; deleted?: boolean };
      if (!response.ok) throw new Error(payload.error ?? "처리하지 못했습니다.");
      showToast({ message: payload.deleted ? "신청을 취소했습니다." : "신청을 철회했습니다.", tone: "success" });
      if (payload.deleted) router.push("/projects");
      else router.refresh();
    } catch (error) {
      showToast({ message: error instanceof Error ? error.message : "처리하지 못했습니다.", tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      className="float-right ml-3 rounded-md border border-[#d7dee8] bg-white px-3 py-1.5 text-xs font-bold text-[#64748b] hover:border-[#fecaca] hover:text-[#b91c1c] disabled:opacity-50"
      disabled={busy}
      onClick={() => void run()}
      type="button"
    >
      {submitted ? "신청 철회" : "신청 취소"}
    </button>
  );
}
