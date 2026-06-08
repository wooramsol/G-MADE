type ReferenceLinkTitleProps = {
  title: string;
  href?: string | null;
  className?: string;
};

export default function ReferenceLinkTitle({ title, href, className = "" }: ReferenceLinkTitleProps) {
  const baseClass = `font-bold text-[#15345b] ${className}`.trim();

  if (!href) {
    return <p className={baseClass}>{title}</p>;
  }

  return (
    <a
      className={`${baseClass} inline-flex max-w-full items-center gap-1.5 hover:text-[#2463b3]`}
      href={href}
      rel="noopener noreferrer"
      target="_blank"
      title={`${title} 원문 보기`}
    >
      <span>{title}</span>
      <ExternalLinkIcon />
    </a>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4 shrink-0 text-[#2463b3]"
      fill="none"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M14 5h5v5M10 14 19 5M15 5h4v4M5 10v9h9"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}
