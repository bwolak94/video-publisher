"use client";
import React from "react";

interface SwitchProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}

export function Switch({ label, description, checked, onChange, disabled, id }: SwitchProps) {
  const switchId = id || `switch-${Math.random().toString(36).slice(2, 9)}`;

  return (
    <label className="vf-switch-row" htmlFor={switchId}>
      <button
        id={switchId}
        role="switch"
        type="button"
        className="vf-switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      />
      <span className="vf-switch-text">
        {label}
        {description && <small>{description}</small>}
      </span>
    </label>
  );
}
