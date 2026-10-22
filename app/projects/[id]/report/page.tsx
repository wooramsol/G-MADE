import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getProjectById } from "@/lib/project-store";
import { isOfficialRole, projectStageStatus } from "@/lib/roles";
import ReportView from "./report-view";

export const dynamic = "force-dynamic";

/** AI 분석 PDF 보고서 — 화면과 같은 카드 구성(프로젝트 개요·대상지 현황·지형 분석·체크리스트 결과)을 인쇄용으로 */
export default async function ProjectReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ reviewId?: string }>;
}) {
  const session = await auth();
  if (!isOfficialRole(session?.user?.role)) redirect("/projects");
  const { id } = await params;
  const query = await searchParams;
  const project = await getProjectById(id);
  if (!project) notFound();
  const reviews = project.checklistReviews ?? [];
  const review = reviews.find((entry) => entry.id === query?.reviewId) ?? reviews[reviews.length - 1];
  if (!review) notFound();
  return <ReportView project={project} review={review} statusLabel={projectStageStatus(project)} />;
}
