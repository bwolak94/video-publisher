"use client";
import React, { useState } from "react";

function getPasswordStrength(pwd: string): number {
  if (!pwd) return 0;
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return score;
}

interface PasswordFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
  hint?: string;
  error?: string;
  showStrength?: boolean;
}

function EyeIcon({ show }: { show: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      {show ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

export function PasswordField({
  label = "Haslo",
  showStrength = false,
  value,
  hint,
  error,
  id,
  ...props
}: PasswordFieldProps) {
  const [show, setShow] = useState(false);
  const fieldId = id || `pwd-${Math.random().toString(36).slice(2, 9)}`;
  const strength = showStrength ? getPasswordStrength(String(value ?? "")) : 0;

  return (
    <div className="vf-field">
      {label && (
        <label className="vf-label" htmlFor={fieldId}>
          {label}
        </label>
      )}
      <div className={`vf-control ${error ? "is-error" : ""}`}>
        <input
          id={fieldId}
          type={show ? "text" : "password"}
          className="vf-input"
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={hint || error ? `${fieldId}-hint` : undefined}
          {...props}
        />
        <button
          type="button"
          className="vf-iconbtn"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Ukryj haslo" : "Pokaz haslo"}
        >
          <EyeIcon show={show} />
        </button>
      </div>
      {showStrength && value && (
        <div className="vf-strength" data-level={strength}>
          <span />
          <span />
          <span />
          <span />
        </div>
      )}
      {(hint || error) && (
        <span id={`${fieldId}-hint`} className={`vf-hint ${error ? "is-error" : ""}`}>
          {error || hint}
        </span>
      )}
    </div>
  );
}
