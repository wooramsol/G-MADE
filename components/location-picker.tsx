"use client";

import dynamic from "next/dynamic";
import { Caption, FormLabel, MutedText, SubsectionTitle } from "@/components/typography";
import { useCallback, useEffect, useState } from "react";
import { mergeAddressWithAdminRegion } from "@/lib/address/resolve-location-label";
import { clientFetchWithTimeout } from "@/lib/client-fetch-with-timeout";

export type LocationSelection = {
  address: string;
  adminRegion?: string;
  x: number;
  y: number;
  source: "address" | "place" | "map";
  note?: string;
};

type SearchItem = {
  id: string;
  title: string;
  address: string;
  adminRegion?: string;
  x: number;
  y: number;
};

const MapPicker = dynamic(() => import("@/components/location-map-picker"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[280px] items-center justify-center rounded-md border border-[#d7dee8] bg-[#f8fafc] text-sm text-[#64748b]">
      지도 불러오는 중…
    </div>
  ),
});

type LocationPickerProps = {
  value: LocationSelection | null;
  onChange: (value: LocationSelection | null) => void;
  disabled?: boolean;
};

const tabs = [
  { id: "address" as const, label: "주소 검색" },
  { id: "place" as const, label: "장소 검색" },
  { id: "map" as const, label: "지도에서 선택" },
];

export function LocationPicker({ value, onChange, disabled }: LocationPickerProps) {
  const [tab, setTab] = useState<"address" | "place" | "map">("address");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [plannedNote, setPlannedNote] = useState(value?.note ?? "");

  const runSearch = useCallback(
    async (mode: "address" | "place") => {
      const q = query.trim();
      if (q.length < 2) {
        setSearchError("검색어를 2자 이상 입력해 주세요.");
        return;
      }
      setSearching(true);
      setSearchError(null);
      try {
        const res = await clientFetchWithTimeout(
          `/api/spatial/address-search?q=${encodeURIComponent(q)}&mode=${mode}`,
        );
        const data = (await res.json()) as {
          results?: Array<{
            id: string;
            label: string;
            x: number;
            y: number;
            roadAddress?: string;
            parcelAddress?: string;
            adminRegion?: string;
          }>;
          error?: string;
        };
        if (!res.ok) {
          throw new Error(data.error ?? "검색에 실패했습니다.");
        }
        const items = (data.results ?? []).map((item) => ({
          id: item.id,
          title: item.label,
          address: item.roadAddress ?? item.parcelAddress ?? item.label,
          adminRegion: item.adminRegion,
          x: item.x,
          y: item.y,
        }));
        setResults(items);
        if (items.length === 0) {
          setSearchError("검색 결과가 없습니다. 다른 키워드나 지도에서 선택해 보세요.");
        }
      } catch (e) {
        setSearchError(e instanceof Error ? e.message : "검색 중 오류가 발생했습니다.");
        setResults([]);
      } finally {
        setSearching(false);
      }
    },
    [query],
  );

  const enrichSelection = async (
    base: Omit<LocationSelection, "address" | "adminRegion"> & {
      address: string;
      adminRegion?: string;
    },
  ): Promise<LocationSelection> => {
    try {
      const res = await clientFetchWithTimeout(
        `/api/spatial/reverse-geocode?x=${base.x}&y=${base.y}`,
      );
      const data = (await res.json()) as {
        address?: string;
        adminRegion?: string;
        error?: string;
      };
      if (res.ok && data.address) {
        return {
          ...base,
          address: data.address,
          adminRegion: data.adminRegion ?? base.adminRegion,
        };
      }
    } catch {
      // 역지오코딩 실패 시 검색 결과 그대로 사용
    }

    return {
      ...base,
      address: mergeAddressWithAdminRegion(base.adminRegion, base.address),
      adminRegion: base.adminRegion,
    };
  };

  const selectItem = async (item: SearchItem, source: "address" | "place") => {
    const enriched = await enrichSelection({
      address: item.address || item.title,
      adminRegion: item.adminRegion,
      x: item.x,
      y: item.y,
      source,
      note: plannedNote.trim() || undefined,
    });
    onChange(enriched);
    setResults([]);
    setSearchError(null);
  };

  const handleMapSelect = async (x: number, y: number) => {
    try {
      const res = await clientFetchWithTimeout(`/api/spatial/reverse-geocode?x=${x}&y=${y}`);
      const data = (await res.json()) as {
        address?: string;
        adminRegion?: string;
        error?: string;
      };
      const label =
        res.ok && data.address
          ? data.address
          : `좌표 (${x.toFixed(5)}, ${y.toFixed(5)})`;
      onChange({
        address: label,
        adminRegion: data.adminRegion,
        x,
        y,
        source: "map",
        note: plannedNote.trim() || undefined,
      });
    } catch {
      onChange({
        address: `좌표 (${x.toFixed(5)}, ${y.toFixed(5)})`,
        x,
        y,
        source: "map",
        note: plannedNote.trim() || undefined,
      });
    }
  };

  useEffect(() => {
    const nextNote = value?.note;
    if (nextNote !== undefined) {
      const timeout = window.setTimeout(() => setPlannedNote(nextNote), 0);
      return () => window.clearTimeout(timeout);
    }
  }, [value?.note]);

  const updateNote = (note: string) => {
    setPlannedNote(note);
    if (value) {
      onChange({ ...value, note: note.trim() || undefined });
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 rounded-md border border-[#d7dee8] bg-[#f8fafc] p-1">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rounded-lg px-3 py-2 text-xs font-bold transition sm:text-sm ${
              tab === item.id
                ? "bg-white text-[#15345b] shadow-sm"
                : "text-[#64748b] hover:text-[#15345b]"
            }`}
            onClick={() => setTab(item.id)}
            disabled={disabled}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "address" ? (
        <div className="space-y-3">
          <p className="text-xs leading-5 text-[#64748b]">
            도로명·지번 등 공식 주소를 검색해 선택하세요. (예: 서울특별시 영등포구 여의도동 123)
          </p>
          <div className="flex gap-2">
            <input
              className="w-full rounded-md border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#2463b3] focus:bg-white"
              placeholder="도로명 또는 지번 주소"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), runSearch("address"))}
              disabled={disabled}
            />
            <button
              type="button"
              className="shrink-0 rounded-md border border-[#d7dee8] bg-white px-4 py-3 text-sm font-bold text-[#15345b] hover:bg-[#eef4fb] disabled:opacity-50"
              onClick={() => runSearch("address")}
              disabled={disabled || searching}
            >
              {searching ? "검색 중…" : "검색"}
            </button>
          </div>
        </div>
      ) : null}

      {tab === "place" ? (
        <div className="space-y-3">
          <p className="text-xs leading-5 text-[#64748b]">
            한강공원, 역명, 시설명 등 장소명으로 검색합니다. (예: 여의한강공원, 강남역)
          </p>
          <div className="flex gap-2">
            <input
              className="w-full rounded-md border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#2463b3] focus:bg-white"
              placeholder="장소·시설·지역명"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), runSearch("place"))}
              disabled={disabled}
            />
            <button
              type="button"
              className="shrink-0 rounded-md border border-[#d7dee8] bg-white px-4 py-3 text-sm font-bold text-[#15345b] hover:bg-[#eef4fb] disabled:opacity-50"
              onClick={() => runSearch("place")}
              disabled={disabled || searching}
            >
              {searching ? "검색 중…" : "검색"}
            </button>
          </div>
        </div>
      ) : null}

      {tab === "map" ? (
        <div className="space-y-3">
          <p className="text-xs leading-5 text-[#64748b]">
            건물이 없는 예정 부지는 지도에서 위치를 클릭해 지정할 수 있습니다.
          </p>
          <MapPicker
            selected={value ? { x: value.x, y: value.y } : null}
            onSelect={handleMapSelect}
            disabled={disabled}
          />
        </div>
      ) : null}

      {searchError ? (
        <p className="rounded-md bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {searchError}
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-[#d7dee8] bg-white p-1">
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f8fafc]"
                onClick={() => selectItem(item, tab === "place" ? "place" : "address")}
                disabled={disabled}
              >
                <span className="font-semibold text-[#15345b]">{item.title}</span>
                {item.address && item.address !== item.title ? (
                  <span className="mt-0.5 block text-xs text-[#64748b]">{item.address}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {value ? (
        <div className="rounded-md border border-[#2463b3]/30 bg-[#e8f1ff]/40 p-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <SubsectionTitle className="text-base">선택된 위치</SubsectionTitle>
              {value.adminRegion ? (
                <p className="mt-1 text-sm font-semibold text-[#15345b]">{value.adminRegion}</p>
              ) : null}
              <MutedText className="mt-1 break-words">{value.address}</MutedText>
              <Caption className="mt-1">
                좌표: {value.x.toFixed(5)}, {value.y.toFixed(5)}
                <span className="ml-2">
                  (
                  {value.source === "map"
                    ? "지도 지정"
                    : value.source === "place"
                      ? "장소 검색"
                      : "주소 검색"}
                  )
                </span>
              </Caption>
            </div>
            <button
              type="button"
              className="type-label shrink-0 text-[#2463b3] hover:underline"
              onClick={() => onChange(null)}
              disabled={disabled}
            >
              변경
            </button>
          </div>
        </div>
      ) : null}

      <label className="block space-y-1.5">
        <FormLabel>
          위치 보조 설명 <span className="font-normal text-[#64748b]">(선택)</span>
        </FormLabel>
        <input
          className="w-full rounded-md border border-[#d7dee8] bg-[#f8fafc] px-4 py-3 text-sm outline-none focus:border-[#2463b3] focus:bg-white"
          placeholder="예: 한강변 일원, 예정 부지, 3블록 남측 등"
          value={plannedNote}
          onChange={(e) => updateNote(e.target.value)}
          disabled={disabled}
        />
        <p className="text-xs leading-5 text-[#64748b]">
          건물이 없거나 범위가 넓은 사업은 보조 설명과 함께 지도에서 좌표를 지정하면 경관지구 조회가 정확합니다.
        </p>
      </label>
    </div>
  );
}
