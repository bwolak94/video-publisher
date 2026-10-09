"use client";
import React from "react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

function ChevronIcon() {
  return (
    <svg
      className="vf-select-chev"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function Select({
  label,
  hint,
  error,
  options,
  placeholder,
  id,
  className = "",
  ...props
}: SelectProps) {
  const fieldId = id || `select-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <div className="vf-field">
      {label && (
        <label className="vf-label" htmlFor={fieldId}>
          {label}
        </label>
      )}
      <div className={`vf-control ${error ? "is-error" : ""}`}>
        <select
          id={fieldId}
          className={`vf-input ${className}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? `${fieldId}-hint` : undefined}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronIcon />
      </div>
      {(hint || error) && (
        <span id={`${fieldId}-hint`} className={`vf-hint ${error ? "is-error" : ""}`}>
          {error || hint}
        </span>
      )}
    </div>
  );
}
