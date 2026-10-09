"use client";
import React from "react";

interface CheckboxProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}

export function Checkbox({ label, description, checked, onChange, disabled, id }: CheckboxProps) {
  const checkId = id || `check-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <label className="vf-check" htmlFor={checkId}>
      <input
        id={checkId}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span>
        <b>{label}</b>
        {description && (
          <>
            <br />
            <span style={{ color: "var(--ink-muted)", fontSize: 12 }}>{description}</span>
          </>
        )}
      </span>
    </label>
  );
}
