"use client";
import React from "react";

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  icon?: React.ReactNode;
  suffix?: string;
  optional?: boolean;
}

export function TextField({
  label,
  hint,
  error,
  icon,
  suffix,
  optional,
  id,
  className = "",
  ...props
}: TextFieldProps) {
  const fieldId = id || `field-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <div className="vf-field">
      {label && (
        <label className="vf-label" htmlFor={fieldId}>
          {label}
          {optional && <span className="vf-opt">opcjonalne</span>}
        </label>
      )}
      <div className={`vf-control ${error ? "is-error" : ""}`}>
        {icon && <span className="vf-icon">{icon}</span>}
        <input
          id={fieldId}
          className={`vf-input ${className}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? `${fieldId}-hint` : undefined}
          {...props}
        />
        {suffix && <span className="vf-suffix">{suffix}</span>}
      </div>
      {(hint || error) && (
        <span id={`${fieldId}-hint`} className={`vf-hint ${error ? "is-error" : ""}`}>
          {error || hint}
        </span>
      )}
    </div>
  );
}
