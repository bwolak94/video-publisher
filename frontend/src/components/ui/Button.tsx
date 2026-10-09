"use client";
import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  block?: boolean;
  iconOnly?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  block = false,
  iconOnly = false,
  icon,
  iconRight,
  children,
  disabled,
  className = "",
  ...props
}: ButtonProps) {
  const classes = [
    "vf-btn",
    `vf-btn-${variant}`,
    size === "sm" ? "vf-btn-sm" : size === "lg" ? "vf-btn-lg" : "",
    block ? "vf-btn-block" : "",
    iconOnly ? "vf-btn-icononly" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="vf-spin" /> : icon}
      {!iconOnly && children}
      {!loading && iconRight}
    </button>
  );
}
