import { useRef, type KeyboardEvent } from "react";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** Shown but not choosable; `hint` says why. */
  disabled?: boolean;
  hint?: string;
}

/**
 * A small either/or switch, as a radio group: Tab reaches the chosen option,
 * the arrow keys move between options and choose as they go.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, step: 1 | -1) => {
    for (let hop = 1; hop <= options.length; hop++) {
      const index = (from + step * hop + options.length * hop) % options.length;
      const option = options[index];
      if (!option || option.disabled) continue;
      onChange(option.value);
      buttons.current[index]?.focus();
      return;
    }
  };

  const onKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") move(index, 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") move(index, -1);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(node) => {
            buttons.current[index] = node;
          }}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          aria-disabled={option.disabled || undefined}
          title={option.hint}
          tabIndex={option.value === value ? 0 : -1}
          onClick={() => {
            if (!option.disabled) onChange(option.value);
          }}
          onKeyDown={(event) => onKey(event, index)}
        >
          {option.label}
          {option.hint && <span className="visually-hidden"> ({option.hint})</span>}
        </button>
      ))}
    </div>
  );
}
