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

/** 폼 필드 라벨 */
export function FieldLabel({
  children,
  className,
  as: Tag = "span",
}: TypographyProps & { as?: ElementType }) {
  return <Tag className={cx("type-label", className)}>{children}</Tag>;
}
