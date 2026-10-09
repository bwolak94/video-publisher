import React from "react";

interface BadgeProps {
  tone?: "neutral" | "accent" | "info" | "warn" | "danger";
  icon?: React.ReactNode;
  mono?: boolean;
  pill?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Badge({
  tone = "neutral",
  icon,
  mono = false,
  pill = false,
  children,
  className = "",
}: BadgeProps) {
  const classes = [
    "vf-badge",
    tone !== "neutral" ? `vf-badge-${tone}` : "",
    mono ? "vf-badge-mono" : "",
    pill ? "vf-pill" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes}>
      {icon && <span className="vf-icon">{icon}</span>}
      {children}
    </span>
  );
}
