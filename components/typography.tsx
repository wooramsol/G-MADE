import type { ElementType, ReactNode } from "react";

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type TypographyProps = {
  children: ReactNode;
  className?: string;
};

/** 페이지 최상단 제목 (h1) */
export function PageTitle({ children, className }: TypographyProps) {
  return <h1 className={cx("type-page-title", className)}>{children}</h1>;
}

/** 주요 섹션 제목 (h2) — 카드·화면 블록 단위 */
export function SectionTitle({ children, className }: TypographyProps) {
  return <h2 className={cx("type-section-title", className)}>{children}</h2>;
}

/** 하위 섹션·패널 제목 (h3) */
export function SubsectionTitle({
  children,
  className,
  id,
}: TypographyProps & { id?: string }) {
  return (
    <h3 className={cx("type-subsection-title", className)} id={id}>
      {children}
    </h3>
  );
}

/** 목록 카드·타일 제목 (h4) */
export function CardTitle({ children, className }: TypographyProps) {
  return <h4 className={cx("type-card-title", className)}>{children}</h4>;
}

/** 평가 단계·작업 블록 제목 */
export function StepTitle({ children, className }: TypographyProps) {
  return <p className={cx("type-step-title", className)}>{children}</p>;
}

/** 상단 라벨·카테고리 (사업명, 심의종류 등) */
export function Eyebrow({ children, className }: TypographyProps) {
  return <p className={cx("type-eyebrow", className)}>{children}</p>;
}

/** 글로벌 헤더 제품명 */
export function BrandTitle({ children, className }: TypographyProps) {
  return <h1 className={cx("type-brand-title", className)}>{children}</h1>;
}

/** 글로벌 헤더 부제 */
export function BrandSubtitle({ children, className }: TypographyProps) {
  return <p className={cx("type-brand-subtitle", className)}>{children}</p>;
}

/** 섹션·카드 설명 문단 */
export function SectionDescription({ children, className }: TypographyProps) {
  return <p className={cx("type-body-muted mt-2", className)}>{children}</p>;
}

/** 본문 */
export function BodyText({ children, className }: TypographyProps) {
  return <p className={cx("type-body", className)}>{children}</p>;
}

/** 보조 본문 */
export function MutedText({ children, className }: TypographyProps) {
  return <p className={cx("type-body-muted", className)}>{children}</p>;
}

/** 캡션·메타 정보 */
export function Caption({ children, className }: TypographyProps) {
  return <p className={cx("type-caption", className)}>{children}</p>;
}

/** 아주 작은 보조 텍스트 (탭 메타 등) */
export function MicroText({
  children,
  className,
  as: Tag = "span",
}: TypographyProps & { as?: ElementType }) {
  return <Tag className={cx("type-micro", className)}>{children}</Tag>;
}

/** 폼 필드 라벨 (xs) */
export function FieldLabel({
  children,
  className,
  as: Tag = "span",
}: TypographyProps & { as?: ElementType }) {
  return <Tag className={cx("type-label", className)}>{children}</Tag>;
}

/** 폼 섹션 라벨 (sm) */
export function FormLabel({
  children,
  className,
  as: Tag = "span",
  htmlFor,
}: TypographyProps & { as?: ElementType; htmlFor?: string }) {
  return (
    <Tag className={cx("type-form-label", className)} htmlFor={htmlFor}>
      {children}
    </Tag>
  );
}

/** 상태·카운트 뱃지 */
export function Badge({ children, className }: TypographyProps) {
  return <span className={cx("type-badge rounded-full px-3 py-1", className)}>{children}</span>;
}

/** 탭·차수 선택 제목 */
export function TabTitle({
  children,
  className,
  as: Tag = "span",
}: TypographyProps & { as?: ElementType }) {
  return <Tag className={cx("type-tab-title", className)}>{children}</Tag>;
}

/** 접이식 섹션 제목 */
export function SummaryTitle({ children, className }: TypographyProps) {
  return <summary className={cx("type-summary-title px-4 py-3", className)}>{children}</summary>;
}

/** 대시보드 지표 라벨 */
export function MetricLabel({ children, className }: TypographyProps) {
  return <p className={cx("type-metric-label", className)}>{children}</p>;
}

/** 대시보드 지표 값 */
export function MetricValue({ children, className }: TypographyProps) {
  return <p className={cx("type-metric-value", className)}>{children}</p>;
}

/** 슬라이더·비율 강조 값 */
export function StatValue({ children, className }: TypographyProps) {
  return <p className={cx("type-stat-value", className)}>{children}</p>;
}

/** 점수 강조 값 */
export function ScoreValue({ children, className }: TypographyProps) {
  return <p className={cx("type-score-value", className)}>{children}</p>;
}

/** 오류 메시지 */
export function ErrorText({ children, className }: TypographyProps) {
  return <p className={cx("type-error", className)}>{children}</p>;
}

/** 네비게이션 링크 */
export function NavLinkText({
  children,
  className,
  as: Tag = "span",
}: TypographyProps & { as?: ElementType }) {
  return <Tag className={cx("type-nav-link", className)}>{children}</Tag>;
}
