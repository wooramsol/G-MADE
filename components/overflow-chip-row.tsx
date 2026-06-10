"use client";

import { useLayoutEffect, useRef, useState } from "react";

type ChipItem = {
  key: string;
  name: string;
  title?: string;
};

type OverflowChipRowProps = {
  items: ChipItem[];
  chipClassName: string;
  expanded: boolean;
  onToggleExpand: () => void;
};

const MORE_BUTTON_RESERVE_PX = 88;

export default function OverflowChipRow({
  items,
  chipClassName,
  expanded,
  onToggleExpand,
}: OverflowChipRowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(items.length);

  useLayoutEffect(() => {
    if (expanded) {
      setVisibleCount(items.length);
      return;
    }

    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure || items.length === 0) {
      setVisibleCount(items.length);
      return;
    }

    const calculate = () => {
      const containerWidth = container.clientWidth;
      if (containerWidth <= 0) {
        setVisibleCount(items.length);
        return;
      }

      const chips = measure.querySelectorAll<HTMLElement>("[data-chip]");
      if (chips.length === 0) {
        setVisibleCount(items.length);
        return;
      }

      let fit = chips.length;
      for (let index = 0; index < chips.length; index += 1) {
        const chip = chips[index];
        const chipEnd = chip.offsetLeft + chip.offsetWidth;
        const hasHiddenItems = index < chips.length - 1;
        const limit = hasHiddenItems ? containerWidth - MORE_BUTTON_RESERVE_PX : containerWidth;
        if (chipEnd > limit) {
          fit = Math.max(1, index);
          break;
        }
      }

      setVisibleCount(fit);
    };

    calculate();
    const observer = new ResizeObserver(calculate);
    observer.observe(container);
    return () => observer.disconnect();
  }, [expanded, items]);

  const hiddenCount = Math.max(0, items.length - visibleCount);
  const visibleItems = expanded ? items : items.slice(0, visibleCount);

  return (
    <div className="relative" ref={containerRef}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 flex flex-nowrap gap-2 opacity-0"
        ref={measureRef}
      >
        {items.map((item) => (
          <span className={`type-badge shrink-0 rounded-full px-2.5 py-1 ${chipClassName}`} data-chip key={item.key}>
            {item.name}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className={`flex gap-2 ${expanded ? "flex-wrap" : "flex-nowrap overflow-hidden"}`}>
          {visibleItems.map((item) => (
            <span
              className={`type-badge shrink-0 rounded-full px-2.5 py-1 ${chipClassName}`}
              key={item.key}
              title={item.title ?? item.name}
            >
              {item.name}
            </span>
          ))}
        </div>
        {hiddenCount > 0 ? (
          <button
            className="type-label shrink-0 text-[#2463b3] underline underline-offset-2"
            type="button"
            onClick={onToggleExpand}
          >
            {expanded ? "접기" : `외 ${hiddenCount}건 더보기`}
          </button>
        ) : null}
      </div>
    </div>
  );
}
