import React from "react";

type ProgressTone = "accent" | "info" | "warn" | "danger";

interface ProgressProps {
  value: number;
  max?: number;
  label?: string;
  valueLabel?: string;
  tone?: ProgressTone;
}

export function Progress({
  value,
  max = 100,
  label,
  valueLabel,
  tone = "accent",
}: ProgressProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const fillClass = ["vf-fill", tone !== "accent" ? `vf-fill-${tone}` : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="vf-progress">
      {(label || valueLabel) && (
        <div className="vf-progress-top">
          {label && <span>{label}</span>}
          {valueLabel && <span className="vf-mono">{valueLabel}</span>}
        </div>
      )}
      <div
        className="vf-track"
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div className={fillClass} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
