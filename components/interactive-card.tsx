import type { ReactNode } from "react";

export const interactiveCardClassName =
  "transition hover:-translate-y-0.5 hover:border-[#2463b3] focus-within:-translate-y-0.5 focus-within:border-[#2463b3]";

export default function InteractiveCard({
  children,
  className = "",
  as: Component = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section";
}) {
  return <Component className={`${interactiveCardClassName} ${className}`.trim()}>{children}</Component>;
}
