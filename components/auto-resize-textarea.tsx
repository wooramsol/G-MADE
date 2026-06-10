"use client";

import { useLayoutEffect, useRef } from "react";

type AutoResizeTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
};

export default function AutoResizeTextarea({
  value,
  onChange,
  placeholder,
  className = "",
}: AutoResizeTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const element = event.currentTarget;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
    onChange(element.value);
  }

  return (
    <textarea
      className={`min-h-[38px] w-full resize-none overflow-hidden rounded-lg border border-[#d7dee8] bg-[#f8fafc] px-2 py-1.5 text-sm leading-6 outline-none placeholder:text-[#94a3b8] focus:border-[#2463b3] focus:bg-white ${className}`.trim()}
      placeholder={placeholder}
      ref={ref}
      rows={1}
      value={value}
      onChange={handleChange}
    />
  );
}
