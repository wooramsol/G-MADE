import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { ChecklistEvidence, ChecklistItemStatus, ChecklistReview } from "./types";
import type { Project } from "@/lib/types";
import { anchorCacheSuffix, buildEvidenceAnchors } from "./evidence-anchors";
import { readSnippetCache, snippetCachePath, snippetRegionKey } from "./snippet-cache";

/**
 * 보완요구서 초안(.docx) 생성 — 미충족·부분충족·확인불가 항목을
 * 공문에 옮겨 쓸 수 있는 형식으로 정리합니다.
 */

/** 웹 결과 화면의 판정 배지 색과 맞춘 docx 텍스트 색 */
const STATUS_COLORS: Record<ChecklistItemStatus, string> = {
  충족: "047857",
  부분충족: "B45309",
  미충족: "B91C1C",
  확인불가: "475569",
};

const FONT = "맑은 고딕";

/** JPEG 바이트에서 (width, height) 읽기 — SOF 마커 파싱 (외부 의존성 없음) */
function readJpegSize(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    // SOF0~SOF15 (DHT·DAC·RST 제외)
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    const length = buffer.readUInt16BE(offset + 2);
    offset += 2 + length;
  }
  return null;
}

const MAX_DOC_IMAGES = 60;
const MAX_IMAGES_PER_ITEM = 2;
const DOC_IMAGE_MAX_WIDTH = 430;

/**
 * 근거 캡처(썸네일)를 캐시에서 읽어 docx 이미지 문단으로. 캐시에 없으면 null —
 * 문서 생성 속도를 위해 즉석 렌더링은 하지 않는다 (분석 직후 선생성돼 대부분 존재).
 */
async function evidenceImageParagraph(
  projectId: string,
  fileId: string,
  evidence: ChecklistEvidence,
): Promise<Paragraph | null> {
  const anchors = buildEvidenceAnchors(evidence);
  const regionKey = `${snippetRegionKey(evidence.region ?? null)}${anchorCacheSuffix(anchors)}`;
  const cached = await readSnippetCache(
    snippetCachePath(projectId, fileId, Number(evidence.page), "thumb", regionKey),
  );
  if (!cached) return null;
  const size = readJpegSize(cached);
  if (!size || size.width < 8 || size.height < 8) return null;
  const width = Math.min(DOC_IMAGE_MAX_WIDTH, size.width);
  const height = Math.round((size.height / size.width) * width);
  return new Paragraph({
    indent: { left: 400 },
    spacing: { before: 40, after: 120 },
    children: [
      new ImageRun({ data: cached, transformation: { width, height }, type: "jpg" }),
    ],
  });
}

function heading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, font: FONT, bold: true })],
  });
}

function body(text: string, options?: { bold?: boolean; indent?: boolean; size?: number; color?: string }): Paragraph {
  return new Paragraph({
    spacing: { after: 80 },
    indent: options?.indent ? { left: 360 } : undefined,
    children: [
      new TextRun({
        text,
        font: FONT,
        bold: options?.bold ?? false,
        size: options?.size ?? 20,
        color: options?.color,
      }),
    ],
  });
}

/** 항목 제목 줄: "N. 항목 원문 — [판정]" (판정은 웹 배지 색과 동일한 색상) */
function itemTitleLine(sequence: number, text: string, status: ChecklistItemStatus, flagged?: boolean): Paragraph {
  const children = [
    new TextRun({ text: `${sequence}. ${text}  `, font: FONT, bold: true, size: 20 }),
    new TextRun({ text: `[${status}]`, font: FONT, bold: true, size: 20, color: STATUS_COLORS[status] }),
  ];
  if (flagged) {
    children.push(new TextRun({ text: "  [확인 필요]", font: FONT, bold: true, size: 20, color: "B45309" }));
  }
  return new Paragraph({ spacing: { before: 160, after: 80 }, children });
}

export async function buildSupplementDoc(
  project: Pick<Project, "id" | "name" | "location" | "reviewType" | "projectType">,
  review: ChecklistReview,
  reviewedAtLabel: string,
): Promise<Buffer> {
  const findingsByItemId = new Map(review.findings.map((finding) => [finding.itemId, finding]));

  // 근거 캡처 삽입용 — 파일명(NFC) → fileId, 파일 1개면 폴백 (웹 화면 pageHref와 동일 방침)
  const pdfFiles = review.files.filter((file) => /\.pdf$/i.test(file.originalName));
  const fileIdByName = new Map(pdfFiles.map((file) => [file.originalName.normalize("NFC"), file.id]));
  const resolveFileId = (fileName: string): string | undefined =>
    fileIdByName.get(fileName.normalize("NFC")) ?? (pdfFiles.length === 1 ? pdfFiles[0].id : undefined);
  let imageBudget = MAX_DOC_IMAGES;

  const sections: Paragraph[] = [];

  sections.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [new TextRun({ text: "경관심의 사전검토 결과 및 보완요구사항 (초안)", font: FONT, bold: true })],
    }),
  );

  sections.push(body(`사 업 명: ${project.name}`, { bold: true }));
  sections.push(body(`사업위치: ${project.location}`));
  sections.push(body(`사업유형 / 심의종류: ${project.projectType} / ${project.reviewType}`));
  sections.push(body(`AI 사전검토 일시: ${reviewedAtLabel} (검토 항목 ${review.items.length}개)`));
  if (review.files.length > 0) {
    sections.push(body(`검토 자료: ${review.files.map((file) => file.originalName).join(", ")}`));
  }
  sections.push(
    body(
      `판정 요약: 충족 ${review.counts.충족} · 부분충족 ${review.counts.부분충족} · 미충족 ${review.counts.미충족} · 확인불가 ${review.counts.확인불가}`,
    ),
  );

  // ── 사업 규모 (웹 화면과 동일 위치·내용) ──
  if (review.metrics && review.metrics.length > 0) {
    sections.push(heading("사업 규모 (문서에서 자동 인식)", HeadingLevel.HEADING_1));
    for (const metric of review.metrics) {
      sections.push(
        body(
          `${metric.label}: ${metric.value}${metric.source ? ` (p.${metric.source.page})` : ""}`,
          { indent: true },
        ),
      );
    }
  }

  // ── 항목별 검토 결과: 웹 결과 화면과 동일하게 구분(카테고리)별 그룹, 같은 순서 ──
  const groups = new Map<string, typeof review.items>();
  for (const item of review.items) {
    const key = item.category?.trim() || "일반";
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  let sequence = 0;
  for (const [category, groupItems] of groups) {
    sections.push(heading(category, HeadingLevel.HEADING_1));

    for (const item of groupItems) {
      const finding = findingsByItemId.get(item.id);
      if (!finding) continue;
      sequence += 1;

      sections.push(itemTitleLine(sequence, item.text, finding.status, Boolean(finding.reviewFlag)));

      // 웹 카드와 동일: 판정 사유 + 보완 방향을 이어서 한 문단으로
      const rationaleLine = [finding.rationale, finding.recommendation].filter(Boolean).join(" ");
      if (rationaleLine) sections.push(body(rationaleLine, { indent: true }));

      let itemImages = 0;
      for (const evidence of finding.evidence) {
        sections.push(body(`근거: p.${evidence.page} — ${evidence.note}`, { indent: true, color: "64748B" }));
        // 웹 화면과 동일한 근거 캡처를 문서에도 삽입 — 업체가 위치를 바로 확인 가능
        if (imageBudget > 0 && itemImages < MAX_IMAGES_PER_ITEM) {
          const fileId = resolveFileId(evidence.fileName);
          if (fileId) {
            const imageParagraph = await evidenceImageParagraph(project.id, fileId, evidence).catch(() => null);
            if (imageParagraph) {
              sections.push(imageParagraph);
              imageBudget -= 1;
              itemImages += 1;
            }
          }
        }
      }
      if (finding.lawRefs.length > 0) {
        sections.push(
          body(
            `관련 기준: ${finding.lawRefs
              .map((law) => `${law.title}${law.article ? ` ${law.article}` : ""}`)
              .join(", ")}`,
            { indent: true, color: "2463B3" },
          ),
        );
      }
      const comment = review.comments?.[item.id]?.trim();
      if (comment) {
        sections.push(body(`담당자 의견: ${comment}`, { indent: true, bold: true }));
      }
    }
  }

  if (sequence === 0) {
    sections.push(heading("검토 결과", HeadingLevel.HEADING_1));
    sections.push(body("표시할 검토 항목이 없습니다."));
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
    styles: {
      default: {
        document: { run: { font: FONT } },
        title: { run: { font: FONT, color: "15345B" } },
        heading1: { run: { font: FONT, color: "15345B" } },
        heading2: { run: { font: FONT, color: "15345B" } },
      },
    },
    sections: [{ children: sections }],
  });

  return Packer.toBuffer(doc);
}
