import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { ChecklistItemStatus, ChecklistReview } from "./types";
import type { Project } from "@/lib/types";

/**
 * 보완요구서 초안(.docx) 생성 — 미충족·부분충족·확인불가 항목을
 * 공문에 옮겨 쓸 수 있는 형식으로 정리합니다.
 */

const TARGET_STATUS_ORDER: ChecklistItemStatus[] = ["미충족", "부분충족", "확인불가"];

const STATUS_GUIDE: Record<string, string> = {
  미충족: "요구사항이 반영되지 않은 것으로 확인된 항목",
  부분충족: "일부만 반영되었거나 근거가 불완전한 항목",
  확인불가: "제출 문서만으로 판단할 수 없어 근거 자료 보완이 필요한 항목",
};

const FONT = "맑은 고딕";

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, font: FONT, bold: true })],
  });
}

function body(text: string, options?: { bold?: boolean; indent?: boolean; size?: number }): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    indent: options?.indent ? { left: 360 } : undefined,
    children: [
      new TextRun({ text, font: FONT, bold: options?.bold ?? false, size: options?.size ?? 20 }),
    ],
  });
}

export async function buildSupplementDoc(
  project: Pick<Project, "name" | "location" | "reviewType" | "projectType">,
  review: ChecklistReview,
  reviewedAtLabel: string,
): Promise<Buffer> {
  const findingsByItemId = new Map(review.findings.map((finding) => [finding.itemId, finding]));

  const sections: Paragraph[] = [];

  sections.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: "경관심의 사전검토 보완요구사항 (초안)", font: FONT, bold: true })],
    }),
  );

  sections.push(body(`사 업 명: ${project.name}`, { bold: true }));
  sections.push(body(`사업위치: ${project.location}`));
  sections.push(body(`사업유형 / 심의종류: ${project.projectType} / ${project.reviewType}`));
  sections.push(body(`AI 사전검토 일시: ${reviewedAtLabel} (검토 항목 ${review.items.length}개)`));
  sections.push(
    body(
      `판정 요약: 충족 ${review.counts.충족} · 부분충족 ${review.counts.부분충족} · 미충족 ${review.counts.미충족} · 확인불가 ${review.counts.확인불가}`,
    ),
  );

  let sequence = 0;

  for (const status of TARGET_STATUS_ORDER) {
    const items = review.items.filter((item) => findingsByItemId.get(item.id)?.status === status);
    if (items.length === 0) continue;

    sections.push(heading(`${status} 항목 (${items.length}건) — ${STATUS_GUIDE[status]}`, HeadingLevel.HEADING_1));

    for (const item of items) {
      const finding = findingsByItemId.get(item.id);
      if (!finding) continue;
      sequence += 1;

      sections.push(
        body(`${sequence}. ${item.category ? `[${item.category}] ` : ""}${item.text}`, { bold: true }),
      );
      if (finding.rationale) sections.push(body(`판정 사유: ${finding.rationale}`, { indent: true }));
      for (const evidence of finding.evidence) {
        sections.push(
          body(`근거: p.${evidence.page} — ${evidence.note}`, { indent: true }),
        );
      }
      if (finding.lawRefs.length > 0) {
        sections.push(
          body(
            `관련 기준: ${finding.lawRefs
              .map((law) => `${law.title}${law.article ? ` ${law.article}` : ""}`)
              .join(", ")}`,
            { indent: true },
          ),
        );
      }
      if (finding.recommendation) {
        sections.push(body(`보완 요구: ${finding.recommendation}`, { indent: true, bold: true }));
      }
      const comment = review.comments?.[item.id]?.trim();
      if (comment) {
        sections.push(body(`담당자 의견: ${comment}`, { indent: true, bold: true }));
      }
    }
  }

  // 보완 대상이 아닌 항목(충족 판정)에 남긴 담당자 의견도 별도 절로 포함 —
  // 화면에서 작성한 의견이 공문 초안에 빠짐없이 옮겨지도록.
  const extraCommentItems = review.items.filter((item) => {
    const status = findingsByItemId.get(item.id)?.status;
    const comment = review.comments?.[item.id]?.trim();
    return Boolean(comment) && status !== undefined && !TARGET_STATUS_ORDER.includes(status);
  });
  if (extraCommentItems.length > 0) {
    sections.push(
      heading(`담당자 추가의견 (${extraCommentItems.length}건) — 충족 판정 항목에 대한 별도 의견`, HeadingLevel.HEADING_1),
    );
    for (const item of extraCommentItems) {
      sequence += 1;
      sections.push(
        body(`${sequence}. ${item.category ? `[${item.category}] ` : ""}${item.text}`, { bold: true }),
      );
      sections.push(body(`담당자 의견: ${review.comments?.[item.id]?.trim() ?? ""}`, { indent: true, bold: true }));
    }
  }

  if (sequence === 0) {
    sections.push(heading("보완요구사항", HeadingLevel.HEADING_1));
    sections.push(body("모든 검토 항목이 충족으로 판정되어 보완요구사항이 없습니다."));
  }

  sections.push(
    new Paragraph({
      spacing: { before: 360 },
      children: [
        new TextRun({
          text: "※ 본 문서는 G-MADE HIVE AI 사전검토 결과를 기반으로 자동 생성된 초안입니다. 발송 전 담당자의 검토·수정이 필요하며, 최종 판단은 심의위원회에 있습니다.",
          font: FONT,
          size: 18,
          color: "64748B",
        }),
      ],
    }),
  );

  const doc = new Document({
    sections: [{ children: sections }],
  });

  return Packer.toBuffer(doc);
}
