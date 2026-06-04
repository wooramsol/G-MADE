"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveLocalProject } from "../local-project-storage";

const reviewTypes = ["경관사전심의", "경관심의", "공공디자인심의"];
const projectTypes = ["복합문화시설", "공공공간", "생활SOC", "업무시설", "공동주택", "기반시설"];

const initialState = {
  name: "",
  location: "",
  client: "",
  designer: "",
  projectType: "",
  scale: "",
  reviewType: "",
  receivedAt: new Date().toISOString().slice(0, 10),
  summary: "",
};

export default function ProjectCreateForm() {
  const router = useRouter();
  const [form, setForm] = useState(initialState);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function updateField(field: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submitProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "프로젝트 생성에 실패했습니다.");
      }

      saveLocalProject(payload.project);
      router.push(`/projects/${payload.project.id}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "프로젝트 생성에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="grid gap-4 lg:grid-cols-2" id="new-project-form" onSubmit={submitProject}>
      <Field label="사업명" placeholder="예: 동부역세권 복합문화시설 경관사전심의" value={form.name} onChange={(value) => updateField("name", value)} />
      <Field label="사업위치" placeholder="예: 서울특별시 중구 세종대로 일원" value={form.location} onChange={(value) => updateField("location", value)} />
      <Field label="시행자" placeholder="예: 서울도시개발공사" value={form.client} onChange={(value) => updateField("client", value)} />
      <Field label="설계자" placeholder="예: GMA 도시건축사사무소" value={form.designer} onChange={(value) => updateField("designer", value)} />
      <SelectField label="사업유형" options={projectTypes} value={form.projectType} onChange={(value) => updateField("projectType", value)} />
      <SelectField label="심의종류" options={reviewTypes} value={form.reviewType} onChange={(value) => updateField("reviewType", value)} />
      <Field label="규모" placeholder="예: 지하 4층 / 지상 18층, 연면적 42,600㎡" value={form.scale} onChange={(value) => updateField("scale", value)} />
      <Field label="접수일" placeholder="예: 2026-06-04" type="date" value={form.receivedAt} onChange={(value) => updateField("receivedAt", value)} />
      <label className="lg:col-span-2">
        <span className="text-sm font-bold text-[#15345b]">사업개요</span>
        <textarea
          className="mt-2 min-h-28 w-full rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#2463b3] focus:bg-white"
          placeholder="사업 목적, 주변 현황, 심의 요청사항을 입력하세요."
          value={form.summary}
          onChange={(event) => updateField("summary", event.target.value)}
        />
      </label>
      {error ? <p className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700 lg:col-span-2">{error}</p> : null}
      <div className="flex flex-wrap gap-3 lg:col-span-2">
        <button className="primary-action rounded-lg px-5 py-3 text-sm font-bold shadow-sm disabled:cursor-not-allowed disabled:bg-slate-400" disabled={loading} type="submit">
          {loading ? "프로젝트 생성 중..." : "프로젝트 생성하기"}
        </button>
        <p className="self-center text-sm text-[#64748b]">생성 후 해당 프로젝트 상세 화면으로 이동합니다.</p>
      </div>
    </form>
  );
}

function Field({ label, placeholder, type = "text", value, onChange }: { label: string; placeholder: string; type?: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="text-sm font-bold text-[#15345b]">{label}</span>
      <input
        className="mt-2 w-full rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#2463b3] focus:bg-white"
        placeholder={placeholder}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function SelectField({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="text-sm font-bold text-[#15345b]">{label}</span>
      <select className="mt-2 w-full rounded-xl border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#2463b3] focus:bg-white" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">선택</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
