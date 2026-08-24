"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorText, FormLabel } from "@/components/typography";
import type { Project } from "@/lib/types";
import { showToast } from "../../toast";
import { clientFetchWithTimeout } from "@/lib/client-fetch-with-timeout";

const reviewTypes = ["경관사전심의", "경관심의", "공공디자인심의"];
const projectTypes = ["복합문화시설", "공공공간", "생활SOC", "업무시설", "공동주택", "기반시설"];
const statusOptions: Project["status"][] = ["접수", "심사 진행중", "완료"];

type FormState = {
  name: string;
  client: string;
  designer: string;
  projectType: string;
  scale: string;
  reviewType: string;
  receivedAt: string;
  summary: string;
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
    status: project.status,
  };
}

function validateForm(form: FormState): string {
  if (!form.name.trim()) return "사업명을 입력해 주세요.";
  if (!form.client.trim()) return "시행자를 입력해 주세요.";
  if (!form.designer.trim()) return "설계자를 입력해 주세요.";
  if (!form.projectType) return "사업유형을 선택해 주세요.";
  if (!form.reviewType) return "심의종류를 선택해 주세요.";
  if (!form.receivedAt.trim()) return "접수일을 입력해 주세요.";
  return "";
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
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="사업명" value={form.name} onChange={(value) => updateField("name", value)} />
        <Field label="시행자" value={form.client} onChange={(value) => updateField("client", value)} />
        <Field label="설계자" value={form.designer} onChange={(value) => updateField("designer", value)} />
        <SelectField label="사업유형" options={projectTypes} value={form.projectType} onChange={(value) => updateField("projectType", value)} />
        <SelectField label="심의종류" options={reviewTypes} value={form.reviewType} onChange={(value) => updateField("reviewType", value)} />
        <Field label="접수일" type="date" value={form.receivedAt} onChange={(value) => updateField("receivedAt", value)} />
        <SelectField
          label="프로젝트 상태"
          options={statusOptions}
          value={form.status}
          onChange={(value) => updateField("status", value as Project["status"])}
        />
        <label className="lg:col-span-2">
          <FormLabel>사업개요</FormLabel>
          <textarea
            className="mt-2 min-h-24 w-full rounded-md border border-[#d7dee8] bg-white px-4 py-3 text-sm outline-none focus:border-[#2463b3]"
            value={form.summary}
            onChange={(event) => updateField("summary", event.target.value)}
          />
        </label>
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
  value,
  onChange,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <FormLabel>{label}</FormLabel>
      <input
        className="mt-2 w-full rounded-md border border-[#d7dee8] bg-white px-4 py-3 text-sm outline-none focus:border-[#2463b3]"
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
        <option value="">선택</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}
