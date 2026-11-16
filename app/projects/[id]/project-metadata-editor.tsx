"use client";

import { BlockingNotice } from "@/components/blocking-notice";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorText, FormLabel } from "@/components/typography";
import { CONTACT_EMAIL_PLACEHOLDER, CONTACT_NOTICE, CONTACT_PHONE_PLACEHOLDER, validateContact } from "@/lib/contact";
import type { Project } from "@/lib/types";
import { showToast } from "../../toast";
import { clientFetchWithTimeout } from "@/lib/client-fetch-with-timeout";

const reviewTypes = ["경관사전심의", "경관심의", "공공디자인심의"];

type FormState = {
  name: string;
  client: string;
  designer: string;
  projectType: string;
  scale: string;
  reviewType: string;
  receivedAt: string;
  summary: string;
  contactPhone: string;
  contactEmail: string;
  status: Project["status"];
};

function toFormState(project: Project): FormState {
  return {
    name: project.name,
    client: project.client,
    designer: project.designer,
    projectType: project.projectType,
    scale: project.scale,
    reviewType: project.reviewType,
    receivedAt: project.receivedAt,
    summary: project.summary ?? "",
    contactPhone: project.contactPhone ?? "",
    contactEmail: project.contactEmail ?? "",
    status: project.status,
  };
}

function validateForm(form: FormState): string {
  if (!form.name.trim()) return "사업명을 입력해 주세요.";
  if (!form.client.trim()) return "시행자를 입력해 주세요.";
  if (!form.reviewType) return "심의종류를 선택해 주세요.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.receivedAt.trim())) return "접수일을 연-월-일 형식으로 입력해 주세요. (예: 2026-09-17)";
  return validateContact(form.contactPhone, form.contactEmail);
}

export default function ProjectMetadataEditor({
  project,
  onUpdated,
}: {
  project: Project;
  onUpdated?: (project: Project) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>(() => toFormState(project));

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
    if (error) setError("");
  }

  async function saveMetadata() {
    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError("");

    const patch = {
      name: form.name.trim(),
      client: form.client.trim(),
      designer: form.designer.trim(),
      projectType: form.projectType,
      scale: form.scale.trim(),
      reviewType: form.reviewType,
      receivedAt: form.receivedAt.trim(),
      summary: form.summary.trim() || undefined,
      contactPhone: form.contactPhone.trim(),
      contactEmail: form.contactEmail.trim(),
      status: form.status,
    };

    try {
      const response = await clientFetchWithTimeout(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        project?: Project;
      };

      if (!response.ok || !payload.project) {
        throw new Error(payload.error ?? "프로젝트 정보 수정에 실패했습니다.");
      }

      const updatedProject = payload.project;
      onUpdated?.(updatedProject);
      setForm(toFormState(updatedProject));
      router.refresh();
      showToast({ message: "프로젝트 정보가 수정되었습니다.", tone: "success" });
      setEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "프로젝트 정보 수정에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  if (!editing) {
    return (
      <button
        className="text-xs font-bold text-[#2463b3] hover:underline"
        type="button"
        onClick={() => {
          setForm(toFormState(project));
          setError("");
          setEditing(true);
        }}
      >
        프로젝트 정보 수정
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-md border border-[#d7dee8] bg-[#f8fafc] p-4">
      {loading ? <BlockingNotice label="프로젝트 정보를 저장하는 중…" /> : null}
      {/* 표시 레이아웃과 동일한 순서: 1행 사업명·접수일·상태 → 사업개요 → 2행 항목들 */}
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <Field label="사업명" placeholder="예: 동부역세권 복합문화시설 신축공사" value={form.name} onChange={(value) => updateField("name", value)} />
        </div>
        <Field label="접수일" placeholder="연-월-일 (예: 2026-09-17)" value={form.receivedAt} onChange={(value) => updateField("receivedAt", value)} />
        <label className="lg:col-span-4">
          <FormLabel>사업개요</FormLabel>
          <textarea
            className="mt-2 min-h-24 w-full rounded-md border border-[#d7dee8] bg-white px-4 py-3 text-sm outline-none focus:border-[#2463b3]"
            placeholder="사업 목적, 주변 현황, 심의 요청사항을 입력하세요."
            value={form.summary}
            onChange={(event) => updateField("summary", event.target.value)}
          />
        </label>
        <Field label="시행자" placeholder="예: 서울도시개발공사" value={form.client} onChange={(value) => updateField("client", value)} />
        <SelectField label="심의종류" options={reviewTypes} value={form.reviewType} onChange={(value) => updateField("reviewType", value)} />
        <Field
          autoComplete="tel"
          inputMode="tel"
          label="담당자 연락처"
          placeholder={CONTACT_PHONE_PLACEHOLDER}
          type="tel"
          value={form.contactPhone}
          onChange={(value) => updateField("contactPhone", value)}
        />
        <Field
          autoComplete="email"
          inputMode="email"
          label="담당자 이메일"
          placeholder={CONTACT_EMAIL_PLACEHOLDER}
          type="email"
          value={form.contactEmail}
          onChange={(value) => updateField("contactEmail", value)}
        />
        <p className="text-xs leading-5 text-[#64748b] lg:col-span-4">{CONTACT_NOTICE}</p>
      </div>
      {error ? <ErrorText className="mt-4 rounded-md bg-red-50 p-3">{error}</ErrorText> : null}
      <div className="mt-4 flex gap-2">
        <button
          className="primary-action rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
          disabled={loading}
          type="button"
          onClick={saveMetadata}
        >
          {loading ? "저장 중..." : "정보 저장"}
        </button>
        <button
          className="rounded-lg border border-[#d7dee8] bg-white px-4 py-2 text-sm font-bold text-[#64748b]"
          disabled={loading}
          type="button"
          onClick={() => {
            setForm(toFormState(project));
            setError("");
            setEditing(false);
          }}
        >
          취소
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  inputMode,
  autoComplete,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  inputMode?: "tel" | "email";
  autoComplete?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <FormLabel>{label}</FormLabel>
      <input
        className="mt-2 w-full rounded-md border border-[#d7dee8] bg-white px-4 py-3 text-sm outline-none focus:border-[#2463b3]"
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <FormLabel>{label}</FormLabel>
      <select
        className="mt-2 w-full rounded-md border border-[#d7dee8] bg-white px-4 py-3 text-sm outline-none focus:border-[#2463b3]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">심의종류를 선택하세요</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
