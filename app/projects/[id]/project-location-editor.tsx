"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LocationPicker, type LocationSelection } from "@/components/location-picker";
import type { Project } from "@/lib/types";
import { showToast } from "../../toast";
import { clientFetchWithTimeout } from "@/lib/client-fetch-with-timeout";

function formatLocationLabel(selection: LocationSelection): string {
  if (selection.note?.trim()) {
    return `${selection.address} (${selection.note.trim()})`;
  }
  return selection.address;
}

function buildLocationPatch(location: LocationSelection) {
  return {
    location: formatLocationLabel(location),
    locationPoint: {
      x: location.x,
      y: location.y,
      source: location.source,
      note: location.note,
    },
  };
}

export default function ProjectLocationEditor({
  project,
  onUpdated,
}: {
  project: Project;
  onUpdated?: (project: Project) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [location, setLocation] = useState<LocationSelection | null>(
    project.locationPoint
      ? {
          address: project.location.split(" (")[0],
          x: project.locationPoint.x,
          y: project.locationPoint.y,
          source: project.locationPoint.source,
          note: project.locationPoint.note,
        }
      : null,
  );

  async function saveLocation() {
    if (!location) {
      showToast({ message: "위치를 선택해 주세요.", tone: "error" });
      return;
    }

    setLoading(true);
    try {
      const patch = buildLocationPatch(location);
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
        throw new Error(payload.error ?? "위치 수정에 실패했습니다.");
      }

      const updatedProject = payload.project;
      onUpdated?.(updatedProject);
      router.refresh();
      showToast({ message: "사업위치가 수정되었습니다.", tone: "success" });
      setEditing(false);
    } catch (error) {
      showToast({
        message: error instanceof Error ? error.message : "위치 수정에 실패했습니다.",
        tone: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="text-xs font-bold text-[#2463b3] hover:underline"
        onClick={() => setEditing(true)}
      >
        위치 수정
      </button>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4">
      <LocationPicker value={location} onChange={setLocation} disabled={loading} />
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="primary-action rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
          onClick={saveLocation}
          disabled={loading}
        >
          {loading ? "저장 중…" : "위치 저장"}
        </button>
        <button
          type="button"
          className="rounded-lg border border-[#d7dee8] bg-white px-4 py-2 text-sm font-bold text-[#64748b]"
          onClick={() => setEditing(false)}
          disabled={loading}
        >
          취소
        </button>
      </div>
    </div>
  );
}
