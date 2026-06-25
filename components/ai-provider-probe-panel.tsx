"use client";

import { useState } from "react";
import { MutedText } from "@/components/typography";

type ProbeResult = {
  provider: "gemini" | "openai" | "claude";
  configured: boolean;
  reachable: boolean;
  message: string;
};

export default function AiProviderProbePanel() {
  const [loading, setLoading] = useState(false);
  const [probes, setProbes] = useState<ProbeResult[] | null>(null);
  const [error, setError] = useState("");

  async function runProbe() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/ai-status?probe=1", { cache: "no-store" });
      const payload = (await response.json()) as { probes?: ProbeResult[]; error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "AI 연결 테스트에 실패했습니다.");
      }

      setProbes(payload.probes ?? []);
    } catch (probeError) {
      setError(probeError instanceof Error ? probeError.message : "AI 연결 테스트에 실패했습니다.");
      setProbes(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#15345b]">AI API 연결 테스트</p>
          <MutedText className="mt-1">
            운영 서버에서 실제 API 호출이 되는지 확인합니다. 키가 없거나 모델/할당량 오류면 원인 메시지를 표시합니다.
          </MutedText>
        </div>
        <button
          className="rounded-lg border border-[#d7dee8] bg-white px-3 py-2 text-sm font-bold text-[#15345b] hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
          type="button"
          onClick={runProbe}
        >
          {loading ? "테스트 중..." : "연결 테스트"}
        </button>
      </div>

      {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}

      {probes?.length ? (
        <ul className="mt-3 space-y-2">
          {probes.map((probe) => (
            <li
              className={`rounded-lg px-3 py-2 text-sm ${
                probe.reachable
                  ? "bg-[#dcfce7] text-[#166534]"
                  : probe.configured
                    ? "bg-[#ffedd5] text-[#9a3412]"
                    : "bg-[#e8f1ff] text-[#2463b3]"
              }`}
              key={probe.provider}
            >
              <p className="font-bold">{probe.provider}</p>
              <p className="mt-1 leading-6">{probe.message}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
