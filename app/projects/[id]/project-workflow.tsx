"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { buildDocumentVersions, type DocumentVersion } from "@/lib/checklist-review/document-versions";
import { uploadProjectFilesToBlob } from "@/lib/client-blob-upload";
import { formatBytes } from "@/lib/format-bytes";
import { formatUploadDateTime } from "@/lib/format-datetime";
import { applicantCanSubmit, applicantCanWithdraw, projectStage } from "@/lib/roles";
import type { StoredFileRef } from "@/lib/stored-file-ref";
import type { Project, ProjectStage } from "@/lib/types";
import { getMaxUploadFileLabel, getOversizedUploadFiles, buildOversizedUploadMessage } from "@/lib/upload-limits";
import { showToast } from "../../toast";
import ChecklistReviewSection from "./checklist-review-section";
import ExpertReviewSection, { type ExpertVersionInfo } from "./expert-review-section";

type StepId = 1 | 2 | 3 | 4;

const STEPS: Array<{ id: StepId; label: string; desc: string }> = [
  { id: 1, label: "도서접수", desc: "기본정보 · 도서 제출" },
  { id: 2, label: "사전심의", desc: "AI 에이전트 분석 · 보완" },
  { id: 3, label: "본심의", desc: "인간 전문가 분석" },
  { id: 4, label: "심의종료", desc: "결과 통지" },
];

function stageStep(stage: ProjectStage): StepId {
  if (stage === "RECEPTION") return 1;
  if (stage === "MAIN_REVIEW") return 3;
  if (stage === "CLOSED") return 4;
  return 2;
}

/** "26.09.04 16:15" 형식 (한국 시간) */
function shortDateTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}.${get("month")}.${get("day")} ${get("hour")}:${get("minute")}`;
}

function changeSummary(version: DocumentVersion): string | null {
  if (version.order === 1) return version.pageCount ? `${version.pageCount}쪽` : null;
  const change = version.change;
  if (!change) return "이전 버전과 페이지 비교 불가";
  const parts: string[] = [];
  if (change.modified > 0) parts.push(`수정 ${change.modified}`);
  if (change.added > 0) parts.push(`추가 ${change.added}`);
  if (change.removed > 0) parts.push(`삭제 ${change.removed}`);
  return parts.length > 0 ? `이전 대비 ${parts.join(" · ")}쪽` : "이전 버전과 페이지 내용 동일";
}


/**
 * 심의 진행 — 1 도서접수 · 2 사전심의 · 3 본심의.
 * 지원자: 1단계(도서 접수·보완 제출)와 진행 상태만. 공무원: 모든 단계.
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

  const versions = useMemo(
    () => buildDocumentVersions(project.checklistReviews ?? []),
    [project.checklistReviews],
  );
  const [versionKey, setVersionKey] = useState<string | null>(null);
  const currentVersion = versions.find((version) => version.key === versionKey) ?? versions[versions.length - 1];

  const expertVersions: ExpertVersionInfo[] = useMemo(
    () =>
      versions.map((version) => {
        const review = version.reviews.find((entry) => entry.files[0]) ?? version.reviews[0];
        return {
          key: version.key,
          label: version.label,
          order: version.order,
          fileName: version.fileName,
          reviewId: review?.id ?? null,
          fileId: review?.files[0]?.id ?? null,
          changedPages: version.change?.changedPages ?? [],
        };
      }),
    [versions],
  );
  // 본심의는 최종(가장 최근) 도서 기준
  const finalVersion = expertVersions[expertVersions.length - 1] ?? null;

  // 아직 AI 분석하지 않은 최신 접수 도서
  const submissions = project.submissions ?? [];
  const latestSubmission = submissions[submissions.length - 1];
  const analyzedKeys = new Set((project.checklistReviews ?? []).flatMap((review) => review.files.map((file) => file.storageKey)));
  const pendingSubmission: StoredFileRef | null =
    latestSubmission && !analyzedKeys.has(latestSubmission.file.storageKey)
      ? { ...latestSubmission.file, uploadedAt: latestSubmission.submittedAt }
      : null;

  // 도서 버전 선택 — 두 탭의 "검토 자료 선택" 카드 안에 같은 것을 넣는다 (상태는 여기서 공유)
  const versionPicker =
    versions.length === 0 ? (
      <p className="pt-1.5 text-xs text-[#94a3b8]">
        PDF를 업로드하면 도서 버전이 만들어지고 검토가 시작됩니다.
      </p>
    ) : (
      <div>
        <div className="flex flex-wrap items-center gap-2">
          {versions.map((version) => {
            const selected = version.key === currentVersion?.key;
            const summary = changeSummary(version);
            return (
              <button
                className={`flex h-12 min-w-[200px] flex-col justify-center rounded-md border px-3 text-left transition ${
                  selected
                    ? "border-[#15345b] bg-[#15345b] text-white"
                    : "border-[#d7dee8] bg-white text-[#334155] hover:border-[#9fb3cc] hover:bg-[#f8fafc]"
                }`}
                key={version.key}
                onClick={() => setVersionKey(version.key)}
                title={`${version.fileName}\n최근 분석 ${formatUploadDateTime(version.lastReviewedAt)} · 검토 ${version.reviews.length}회`}
                type="button"
              >
                <span className="flex items-baseline justify-between gap-3 text-xs font-bold leading-4">
                  {version.label}
                  <span className={`text-[11px] font-medium ${selected ? "text-[#c9d6e6]" : "text-[#94a3b8]"}`}>
                    {shortDateTime(version.lastReviewedAt)}
                  </span>
                </span>
                <span className={`mt-0.5 block truncate text-[11px] leading-4 ${selected ? "text-[#dbe4f0]" : "text-[#64748b]"}`}>
                  {[version.sizeBytes > 0 ? formatBytes(version.sizeBytes) : null, summary].filter(Boolean).join(" · ") || "\u00a0"}
                </span>
              </button>
            );
          })}
        </div>
        {currentVersion ? (
          <p className="mt-2 truncate text-[11px] text-[#94a3b8]">
            {currentVersion.fileName}
            {currentVersion.change && currentVersion.change.changedPages.length > 0
              ? ` · 바뀐 페이지 ${currentVersion.change.changedPages.slice(0, 20).map((page) => `p.${page}`).join(", ")}${
                  currentVersion.change.changedPages.length > 20 ? " …" : ""
                }`
              : ""}
          </p>
        ) : null}
      </div>
    );


  return (
    <div className="space-y-4">
      <Stepper current={currentStep} official={official} onSelect={setViewStep} rejected={stage === "REJECTED" || stage === "WITHDRAWN"} rejectedLabel={stage === "WITHDRAWN" ? "철회" : "반려"} view={viewStep} />

      {!official ? <ApplicantStatus project={project} /> : null}

      <div className={`rounded-md border-2 bg-white p-5 panel-shadow ${viewStep >= 3 ? "border-[#111827]" : viewStep === 2 ? "border-[#2463b3]" : "border-[#15345b]"}`}>
        {viewStep === 1 || !official ? <ReceptionPanel official={official} project={project} /> : null}
        {official ? (
          <>
            <div hidden={viewStep !== 2}>
              <ChecklistReviewSection
                activeVersionKey={currentVersion?.key ?? null}
                onActiveVersionChange={setVersionKey}
                pendingSubmission={pendingSubmission}
                project={project}
                versionPicker={versionPicker}
              />
              <DecisionPanel pendingSubmission={pendingSubmission} project={project} />
            </div>
            <div hidden={viewStep !== 3}>
              {currentStep === 3 ? <CloseReviewBar project={project} /> : null}
              {currentStep >= 3 ? (
                <ExpertReviewSection
                  active={viewStep === 3}
                  activeVersion={finalVersion}
                  project={project}
                  versions={expertVersions}
                />
              ) : (
                <p className="rounded-md border border-dashed border-[#d0d5dd] bg-[#f8fafc] px-4 py-10 text-center text-sm text-[#64748b]">
                  사전심의를 &lsquo;통과&rsquo;하면 최종 도서로 본심의(인간 전문가 분석)를 진행할 수 있습니다.
                </p>
              )}
            </div>
            {viewStep === 4 ? <ClosedPanel project={project} /> : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

function Stepper({
  current,
  view,
  official,
  rejected,
  rejectedLabel = "반려",
  onSelect,
}: {
  rejectedLabel?: string;
  current: StepId;
  view: StepId;
  official: boolean;
  rejected: boolean;
  onSelect: (step: StepId) => void;
}) {
  return (
    <ol className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {STEPS.map((step) => {
        const done = step.id < current;
        const isCurrent = step.id === current;
        const selected = official && step.id === view;
        const reachable = official && step.id <= current;
        return (
          <li key={step.id}>
            <button
              className={`flex w-full items-center gap-4 rounded-lg border-2 px-5 py-5 text-left transition ${
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
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-black ${
                  selected ? "bg-white/20" : done ? "bg-[#15345b] text-white" : isCurrent ? "bg-[#2463b3] text-white" : "bg-[#e2e8f0]"
                }`}
              >
                {done ? "✓" : step.id}
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-bold leading-6">
                  {step.id}단계 · {step.label}
                  {isCurrent && rejected && step.id === 2 ? <span className="ml-2 rounded bg-red-100 px-1.5 text-xs text-red-700">{rejectedLabel}</span> : null}
                </span>
                <span className={`block text-xs ${selected ? "text-white/80" : "opacity-75"}`}>{step.desc}</span>
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
  const submissions = project.submissions ?? [];
  const lastSubmission = submissions[submissions.length - 1];
  const resubmitted = last && lastSubmission && lastSubmission.submittedAt > last.decidedAt;

  let tone = "border-[#c9d6e6] bg-[#f3f7fc] text-[#15345b]";
  let title = "도서를 접수해 주세요";
  let body = "아래에서 심의 도서(PDF)를 제출하면 사전심의가 시작됩니다.";
  if (stage === "PRE_REVIEW") {
    if (last?.decision === "보완요청" && !resubmitted) {
      tone = "border-[#f2c48d] bg-[#fff8ed] text-[#92400e]";
      title = "보완 요청이 있습니다";
      body = last.note ?? "담당 공무원이 전달한 보완요구서를 확인하고 보완 도서를 제출해 주세요.";
    } else {
      title = resubmitted ? "보완 도서가 제출되었습니다" : "사전심의 진행 중";
      body = "담당 공무원이 도서를 검토하고 있습니다. 보완이 필요하면 이 화면에 안내됩니다.";
    }
  } else if (stage === "MAIN_REVIEW") {
    tone = "border-[#bbf7d0] bg-[#ecfdf5] text-[#047857]";
    title = "사전심의 통과 · 본심의 진행 중";
    body = "최종 도서로 본심의가 진행됩니다.";
  } else if (stage === "CLOSED") {
    tone = "border-[#c9d6e6] bg-[#f3f7fc] text-[#15345b]";
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
      {last && (last.decision !== "통과") ? (
        <p className="mt-1 text-xs opacity-75">
          {formatUploadDateTime(last.decidedAt)} · {last.decidedBy.name}
        </p>
      ) : null}
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
  const canSubmit = official ? stage === "RECEPTION" || stage === "PRE_REVIEW" : applicantCanSubmit(project);

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
      showToast({ message: submissions.length === 0 ? "도서가 제출되었습니다." : "보완 도서가 제출되었습니다.", tone: "success" });
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
            {submissions.length === 0 ? "이 도서를 제출하시겠습니까?" : "이 보완 도서를 제출하시겠습니까?"}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-[#c9d6e6] bg-white px-4 py-3 text-sm">
            <span className="rounded-[3px] bg-[#15345b] px-2 py-0.5 text-xs font-bold text-white">PDF</span>
            <span className="min-w-0 flex-1 truncate font-semibold text-[#172033]">{pendingFile.name}</span>
            <span className="text-xs text-[#64748b]">{formatBytes(pendingFile.size)}</span>
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-[#334155]">
            <li>제출한 도서는 담당부서로 전달되며, 제출 후에는 취소하거나 바꿀 수 없습니다.</li>
            <li>접수가 완료되면 알림으로 안내해 드립니다.</li>
            {submissions.length > 0 ? <li>보완 요청 사항이 모두 반영되었는지 다시 한 번 확인해 주세요.</li> : null}
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
            {submissions.length === 0 ? "+ 심의 도서 PDF 첨부 (클릭 또는 드래그)" : "+ 보완 도서 PDF 첨부 (클릭 또는 드래그)"}
          </span>
          <span className="mt-1 text-xs text-[#64748b]">
            첨부한 뒤 내용을 확인하고 제출합니다.
          </span>
        </button>
      ) : (
        <p className="mt-4 rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 text-sm text-[#64748b]">
          {stage === "PRE_REVIEW" ? "제출한 도서를 담당부서에서 검토하고 있습니다. 보완 요청을 받으면 보완 도서를 제출할 수 있습니다." : "도서 제출 기간이 아닙니다."}
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
                  {submission.round === 1 ? "최초 접수" : `${submission.round - 1}차 보완`}
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

/** 2단계 — 사전심의 판정 (공무원) */
function DecisionPanel({ project, pendingSubmission }: { project: Project; pendingSubmission: StoredFileRef | null }) {
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
    if (decision === "통과" && pendingSubmission) {
      showToast({ message: "최근 접수된 도서를 아직 AI 분석하지 않았습니다. 위의 'AI 에이전트 분석 시작'을 먼저 눌러 주세요. (본심의는 분석된 최종 도서로 진행됩니다)", tone: "error" });
      return;
    }
    const confirmText =
      decision === "통과" ? "사전심의를 통과 처리하고 본심의로 넘길까요?" : decision === "반려" ? "반려 처리할까요? 심의가 종료됩니다." : "지원자에게 보완을 요청할까요?";
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
    if (!window.confirm("사전심의 단계로 되돌릴까요?")) return;
    await fetch(`/api/projects/${project.id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "PRE_REVIEW" }),
    });
    router.refresh();
  };

  return (
    <section className="mt-6 rounded-md border border-[#d7dee8] bg-[#f8fafc] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-[#15345b]">사전심의 판정</h3>
        {stage !== "PRE_REVIEW" ? (
          <button className="text-xs font-semibold text-[#64748b] underline" onClick={() => void reopen()} type="button">
            사전심의로 되돌리기
          </button>
        ) : null}
      </div>
      {stage === "PRE_REVIEW" ? (
        <>
          <textarea
            className="mt-3 h-20 w-full resize-y rounded-md border border-[#d7dee8] bg-white p-3 text-sm outline-none focus:border-[#2463b3]"
            onChange={(event) => setNote(event.target.value)}
            placeholder="보완요청·반려 사유 (지원자 화면에 표시됩니다). 보완요구서는 'AI 분석 다운로드'로 받아 함께 전달하세요."
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
              통과 → 본심의
            </button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-[#475569]">
          {stage === "MAIN_REVIEW" ? "사전심의를 통과해 본심의 단계입니다." : stage === "WITHDRAWN" ? "지원자가 신청을 철회했습니다." : stage === "REJECTED" ? "반려되어 심의가 종료되었습니다." : "도서 접수 후 판정할 수 있습니다."}
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


/** 3단계 상단 — 본심의를 마치고 심의 종료 처리 (지원자에게 결과 통지 예정 안내 알림) */
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
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3">
      <p className="text-sm text-[#475569]">심사위원 의견 입력을 마쳤으면 심의를 종료하세요. 지원자에게 결과 통지 예정 안내가 전달됩니다.</p>
      <button className="rounded-md bg-[#15345b] px-4 py-2 text-sm font-bold text-white disabled:opacity-50" disabled={busy} onClick={() => void close()} type="button">
        본심의 종료 → 심의종료
      </button>
    </div>
  );
}

/** 4단계 — 심의 종료 */
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
      <p className="mt-1 text-sm text-[#475569]">심사위원 의견은 3단계 본심의에서 계속 확인·다운로드할 수 있습니다.</p>
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
