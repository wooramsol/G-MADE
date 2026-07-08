"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LocationPicker, type LocationSelection } from "@/components/location-picker";
import {
  buildLocationPointFromSelection,
  formatLocationLabel,
} from "@/lib/address/resolve-location-label";
import { ErrorText, FormLabel, MutedText } from "@/components/typography";
import { showToast } from "../../toast";
import { clientFetchWithTimeout } from "@/lib/client-fetch-with-timeout";

const reviewTypes = ["경관사전심의", "경관심의", "공공디자인심의"];
const projectTypes = ["복합문화시설", "공공공간", "생활SOC", "업무시설", "공동주택", "기반시설"];

const initialState = {
  name: "",
  client: "",
  designer: "",
  projectType: "",
  scale: "",
  reviewType: "",
  receivedAt: new Date().toISOString().slice(0, 10),
  summary: "",
};

function validateForm(form: typeof initialState, location: LocationSelection | null): string {
  if (!form.name.trim()) return "사업명을 입력해 주세요.";
  if (!location) return "사업위치를 검색하거나 지도에서 선택해 주세요.";
  if (!form.client.trim()) return "시행자를 입력해 주세요.";
  if (!form.designer.trim()) return "설계자를 입력해 주세요.";
  if (!form.projectType) return "사업유형을 선택해 주세요.";
  if (!form.scale.trim()) return "규모를 입력해 주세요.";
  if (!form.reviewType) return "심의종류를 선택해 주세요.";
  if (!form.receivedAt.trim()) return "접수일을 입력해 주세요.";
  return "";
}

export default function ProjectCreateForm() {
  const router = useRouter();
  const [form, setForm] = useState(initialState);
  const [location, setLocation] = useState<LocationSelection | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    if (error) setError("");
  }

  async function submitProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationError = validateForm(form, location);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setLoading(true);

    try {
      const response = await clientFetchWithTimeout("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          location: formatLocationLabel(location!),
          locationPoint: buildLocationPointFromSelection(location!),
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "프로젝트 생성에 실패했습니다.");
      }

      showToast({ message: "프로젝트가 생성되었습니다.", tone: "success" });
      window.setTimeout(() => router.push(`/projects/${payload.project.id}`), 650);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "프로젝트 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4 lg:grid-cols-2" id="new-project-form" onSubmit={submitProject}>
      {error ? <ErrorText className="rounded-xl bg-red-50 p-3 lg:col-span-2">{error}</ErrorText> : null}
      <Field label="사업명" required placeholder="예: 동부역세권 복합문화시설 경관사전심의" value={form.name} onChange={(value) => updateField("name", value)} />
      <div className="lg:col-span-2">
        <FormLabel as="p">
          사업위치 <span className="text-red-600">*</span>
        </FormLabel>
        <div className="mt-2 rounded-xl border border-[#d7dee8] bg-white p-4">
          <LocationPicker value={location} onChange={setLocation} disabled={loading} />
        </div>
      </div>
      <Field label="시행자" required placeholder="예: 서울도시개발공사" value={form.client} onChange={(value) => updateField("client", value)} />
      <Field label="설계자" required placeholder="예: GMA 도시건축사사무소" value={form.designer} onChange={(value) => updateField("designer", value)} />
      <SelectField label="사업유형" required options={projectTypes} value={form.projectType} onChange={(value) => updateField("projectType", value)} />
      <SelectField label="심의종류" required options={reviewTypes} value={form.reviewType} onChange={(value) => updateField("reviewType", value)} />
      <Field label="규모" required placeholder="예: 지하 4층 / 지상 18층, 연면적 42,600㎡" value={form.scale} onChange={(value) => updateField("scale", value)} />
      <Field label="접수일" required placeholder="예: 2026-06-04" type="date" value={form.receivedAt} onChange={(value) => updateField("receivedAt", value)} />
      <label className="lg:col-span-2">
        <FormLabel>사업개요</FormLabel>
        <textarea
          className="mt-2 min-h-28 w-full rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#2463b3] focus:bg-white"
          placeholder="사업 목적, 주변 현황, 심의 요청사항을 입력하세요."
          value={form.summary}
          onChange={(event) => updateField("summary", event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-3 lg:col-span-2">
        <button className="primary-action rounded-lg px-5 py-3 text-sm font-bold shadow-sm disabled:cursor-not-allowed disabled:bg-slate-400" disabled={loading} type="submit">
          {loading ? "프로젝트 생성 중..." : "프로젝트 생성하기"}
        </button>
        <MutedText className="self-center">
          생성 후 프로젝트 상세 화면에서 평가기준·자료 업로드를 진행합니다.
        </MutedText>
      </div>
    </form>
  );
}

function Field({
  label,
  placeholder,
  type = "text",
  value,
  onChange,
  required = false,
}: {
  label: string;
  placeholder: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label>
      <FormLabel>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </FormLabel>
      <input
        className="mt-2 w-full rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#2463b3] focus:bg-white"
        placeholder={placeholder}
        required={required}
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
  required = false,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label>
      <FormLabel>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </FormLabel>
      <select
        className="mt-2 w-full rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#2463b3] focus:bg-white"
        required={required}
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
