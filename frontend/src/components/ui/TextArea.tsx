"use client";
import React from "react";

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
}

export function TextArea({
  label,
  hint,
  error,
  optional,
  id,
  className = "",
  rows = 4,
  ...props
}: TextAreaProps) {
  const fieldId = id || `textarea-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <div className="vf-field">
      {label && (
        <label className="vf-label" htmlFor={fieldId}>
          {label}
          {optional && <span className="vf-opt">opcjonalne</span>}
        </label>
      )}
      <div className={`vf-control ${error ? "is-error" : ""}`}>
        <textarea
          id={fieldId}
          className={`vf-input ${className}`}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? `${fieldId}-hint` : undefined}
          {...props}
        />
      </div>
      {(hint || error) && (
        <span id={`${fieldId}-hint`} className={`vf-hint ${error ? "is-error" : ""}`}>
          {error || hint}
        </span>
      )}
    </div>
  );
}
