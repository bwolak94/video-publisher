import React from "react";

type Status = "queued" | "generating" | "review" | "qa" | "failed" | "blocked" | "done";

const STATUS_MAP: Record<Status, { label: string; tone: string; dot?: boolean }> = {
  queued:     { label: "W kolejce",      tone: "" },
  generating: { label: "Generowanie",    tone: "vf-badge-info", dot: true },
  review:     { label: "Do akceptacji",  tone: "vf-badge-warn" },
  qa:         { label: "QA",             tone: "vf-badge-warn" },
  failed:     { label: "Błąd",           tone: "vf-badge-danger" },
  blocked:    { label: "Zablokowane",    tone: "vf-badge-danger" },
  done:       { label: "Gotowe",         tone: "vf-badge-accent" },
};

interface StatusPillProps {
  status: Status;
  children?: React.ReactNode;
}

export function StatusPill({ status, children }: StatusPillProps) {
  const { label, tone, dot } = STATUS_MAP[status];
  const classes = ["vf-badge vf-pill", tone].filter(Boolean).join(" ");

  return (
    <span className={classes}>
      {dot ? (
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "var(--info)",
            animation: "vf-pulse 1.2s ease-in-out infinite",
          }}
        />
      ) : (
        <span
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "currentColor",
            opacity: 0.6,
          }}
        />
      )}
      {children ?? label}
    </span>
  );
}
