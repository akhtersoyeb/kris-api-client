import { useMemo, useRef, useState, type ComponentProps, type MouseEvent } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useVariablesStore } from "@/store/variables";
import { splitSegments } from "./tokens";
import { VariableTooltip, type HoverTarget } from "./VariableTooltip";

type Props = Omit<ComponentProps<"input">, "value" | "onChange" | "className"> & {
  value: string;
  onChange: (value: string) => void;
  /** Layout classes for the wrapper, for example `flex-1`. */
  className?: string;
  /** Height and font classes, applied to both the input and its highlight layer. */
  inputClassName?: string;
};

/**
 * A normal text input with {{variables}} highlighted. The highlights are drawn on a transparent copy of
 * the text behind the input (kept scrolled to match), so typing, caret and selection stay native.
 */
export function VariableInput({ value, onChange, className, inputClassName, ...rest }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const context = useVariablesStore((s) => s.context);
  const segments = useMemo(() => splitSegments(value), [value]);
  // `md:text-sm` mirrors the base Input classes so both layers always use the same font size.
  const text = cn("text-sm md:text-sm", inputClassName);

  const syncScroll = (el: HTMLInputElement) =>
    requestAnimationFrame(() => setScroll(el.scrollLeft));

  function onMouseMove(e: MouseEvent<HTMLInputElement>) {
    const spans = overlayRef.current?.querySelectorAll<HTMLElement>("[data-var]") ?? [];
    for (const span of spans) {
      const r = span.getBoundingClientRect();
      if (
        e.clientX >= r.left &&
        e.clientX <= r.right &&
        e.clientY >= r.top &&
        e.clientY <= r.bottom
      ) {
        setHover((prev) =>
          prev?.name === span.dataset.var
            ? prev
            : { name: span.dataset.var ?? "", x: r.left, y: r.bottom },
        );
        return;
      }
    }
    setHover(null);
  }

  return (
    <div className={cn("relative", className)}>
      <div aria-hidden className="pointer-events-none absolute inset-px overflow-hidden rounded-md">
        <div
          ref={overlayRef}
          className={cn(
            "flex h-full w-max min-w-full items-center px-3 whitespace-pre text-transparent",
            text,
          )}
          style={{ transform: `translateX(${-scroll}px)` }}
        >
          {segments.map((seg, i) =>
            seg.name === null ? (
              <span key={i}>{seg.text}</span>
            ) : (
              <span
                key={i}
                data-var={seg.name}
                className={cn(
                  "rounded-sm",
                  context[seg.name]
                    ? "bg-primary/20"
                    : "bg-amber-500/30 underline decoration-amber-600 decoration-wavy",
                )}
              >
                {seg.text}
              </span>
            ),
          )}
        </div>
      </div>
      <Input
        {...rest}
        value={value}
        className={cn("relative w-full bg-transparent dark:bg-transparent", text)}
        onChange={(e) => {
          onChange(e.target.value);
          syncScroll(e.currentTarget);
        }}
        onScroll={(e) => syncScroll(e.currentTarget)}
        onKeyUp={(e) => syncScroll(e.currentTarget)}
        onSelect={(e) => syncScroll(e.currentTarget)}
        onFocus={(e) => syncScroll(e.currentTarget)}
        onMouseUp={(e) => syncScroll(e.currentTarget)}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
      />
      <VariableTooltip target={hover} />
    </div>
  );
}
