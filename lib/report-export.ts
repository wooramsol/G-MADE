import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { HybridResult, Project } from "./types";
import type { UploadAnalysisSession } from "./types";

export type ReportPayload = {
  project: Pick<
    Project,
    "name" | "location" | "client" | "designer" | "projectType" | "scale" | "reviewType" | "receivedAt"
  >;
  session?: UploadAnalysisSession;
  results: HybridResult[];
  projectScore: number;
  generatedAt: string;
};

export function buildReportHtml(payload: ReportPayload): string {
  const rows = payload.results
    .map(
      (result) => `
      <tr>
        <td>${escapeHtml(result.item.detailItem)}</td>
        <td>${result.aiEvaluation.score}</td>
        <td>${result.humanEvaluation.score}</td>
        <td><strong>${result.finalScore}</strong> (${result.finalGrade})</td>
        <td>${escapeHtml(result.aiEvaluation.rationale)}</td>
      </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(payload.project.name)} 심의 평가 보고서</title>
  <style>
    body { font-family: "Malgun Gothic", sans-serif; margin: 40px; color: #172033; }
    h1 { font-size: 22px; margin-bottom: 8px; }
    .meta { color: #64748b; font-size: 13px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #d7dee8; padding: 8px; vertical-align: top; }
    th { background: #eef4fb; text-align: left; }
    .summary { margin: 16px 0; line-height: 1.6; }
  </style>
</head>
<body>
  <h1>${escapeHtml(payload.project.name)}</h1>
  <p class="meta">경관·공공디자인 심의 평가 보고서 · 생성 ${payload.generatedAt}</p>
  <p><strong>사업위치</strong> ${escapeHtml(payload.project.location)}</p>
  <p><strong>심의종류</strong> ${escapeHtml(payload.project.reviewType)} · <strong>규모</strong> ${escapeHtml(payload.project.scale)}</p>
  <p><strong>종합 점수</strong> ${payload.projectScore}점</p>
  ${payload.session ? `<p class="summary">${escapeHtml(payload.session.analysis.summary)}</p>` : ""}
  <table>
    <thead>
      <tr>
        <th>평가항목</th><th>AI</th><th>인간</th><th>최종</th><th>근거</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

export async function buildReportDocx(payload: ReportPayload): Promise<Buffer> {
  const tableRows = [
    new TableRow({
      children: ["평가항목", "AI", "인간", "최종", "근거"].map(
        (text) =>
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
          }),
      ),
    }),
    ...payload.results.map(
      (result) =>
        new TableRow({
          children: [
            result.item.detailItem,
            String(result.aiEvaluation.score),
            String(result.humanEvaluation.score),
            `${result.finalScore} (${result.finalGrade})`,
            result.aiEvaluation.rationale,
          ].map(
            (text) =>
              new TableCell({
                children: [new Paragraph(text)],
              }),
          ),
        }),
    ),
  ];

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: `${payload.project.name} 심의 평가 보고서`,
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph(`생성일: ${payload.generatedAt}`),
          new Paragraph(`사업위치: ${payload.project.location}`),
          new Paragraph(`심의종류: ${payload.project.reviewType}`),
          new Paragraph(`종합 점수: ${payload.projectScore}점`),
          ...(payload.session
            ? [new Paragraph({ text: payload.session.analysis.summary, spacing: { after: 200 } })]
            : []),
          new Table({ rows: tableRows }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
