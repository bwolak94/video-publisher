import React from "react";

interface InlineAlertProps {
  tone?: "info" | "warn" | "danger" | "accent";
  title?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function InlineAlert({
  tone = "info",
  title,
  icon,
  action,
  children,
  className = "",
}: InlineAlertProps) {
  const classes = ["vf-alert", `vf-alert-${tone}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      role={tone === "danger" ? "alert" : undefined}
      aria-live={tone === "danger" ? "assertive" : undefined}
    >
      {icon && <span className="vf-icon">{icon}</span>}
      <div style={{ flex: 1 }}>
        {title && <b>{title}</b>}
        {children}
        {action && <div style={{ marginTop: 8 }}>{action}</div>}
      </div>
    </div>
  );
}
