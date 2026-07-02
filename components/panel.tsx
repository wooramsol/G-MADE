import type { ReactNode } from "react";
import { Badge, Eyebrow, SubsectionTitle } from "@/components/typography";

/** 흰색 카드 패널. 여러 페이지에서 중복 정의되던 Panel의 공통 구현. */
export function Panel({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[#d7dee8] bg-white p-5 panel-shadow">
      <div className="mb-5 flex items-center justify-between gap-4">
        <SubsectionTitle>{title}</SubsectionTitle>
        {typeof action === "string" ? (
          <Badge className="bg-[#e8f1ff] text-[#2463b3]">{action}</Badge>
        ) : (
          action ?? null
        )}
      </div>
      {children}
    </div>
  );
}

/** 라벨-값 표시 카드. 프로젝트 개요 등에서 사용. */
export function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#d7dee8] bg-[#f8fafc] p-4">
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-2 font-semibold leading-6 text-[#172033]">{value}</p>
    </div>
  );
}
