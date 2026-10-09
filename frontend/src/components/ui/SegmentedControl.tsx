"use client";
import React from "react";

interface SegmentOption {
  value: string;
  label: string;
  count?: number;
}

interface SegmentedControlProps {
  options: SegmentOption[];
  value: string;
  onChange: (value: string) => void;
  block?: boolean;
  className?: string;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  block = false,
  className = "",
}: SegmentedControlProps) {
  const classes = ["vf-seg", block ? "is-block" : "", className].filter(Boolean).join(" ");

  return (
    <div className={classes} role="group">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
          {opt.count !== undefined && <small>{opt.count}</small>}
        </button>
      ))}
    </div>
  );
}
