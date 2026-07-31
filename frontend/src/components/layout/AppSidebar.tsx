"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002";

// ─── Icons ───────────────────────────────────────────────────────────────────

function IconGrid() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <rect x="1" y="1" width="5.5" height="5.5" rx="1.5" fill="currentColor" />
      <rect x="8.5" y="1" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity="0.4" />
      <rect x="1" y="8.5" width="5.5" height="5.5" rx="1.5" fill="currentColor" opacity="0.4" />
      <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1.5" fill="currentColor" />
    </svg>
  );
}
function IconStar() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 1.5L9 5.5H13.5L10 8L11.5 12L7.5 9.5L3.5 12L5 8L1.5 5.5H6L7.5 1.5Z" fill="currentColor" />
    </svg>
  );
}
function IconGear() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <circle cx="7.5" cy="7.5" r="2.25" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7.5 1v1.75M7.5 12.25V14M1 7.5h1.75M12.25 7.5H14M2.93 2.93l1.24 1.24M10.83 10.83l1.24 1.24M2.93 12.07l1.24-1.24M10.83 4.17l1.24-1.24" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
function IconWarning() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
      <path d="M7.5 5.5v3M7.5 10.25v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M6.44 2.25L1.25 11a1.2 1.2 0 001.06 1.75h10.38A1.2 1.2 0 0013.75 11L8.56 2.25a1.2 1.2 0 00-2.12 0z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Nav config ──────────────────────────────────────────────────────────────

const PRIMARY_NAV = [
  { href: "/dashboard",          label: "Dashboard",    Icon: IconGrid },
  { href: "/create",             label: "Creator Mode", Icon: IconStar },
  { href: "/dashboard/settings", label: "Settings",     Icon: IconGear },
];

const SECONDARY_NAV = [
  { href: "/dashboard/dlq", label: "Dead Letter Queue", Icon: IconWarning },
];

// ─── Component ───────────────────────────────────────────────────────────────

export function AppSidebar() {
  const pathname = usePathname();
  const [workerEnabled, setWorkerEnabled] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/settings`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.worker?.enabled) setWorkerEnabled(true); })
      .catch(() => {});
  }, []);

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);

  return (
    <aside
      style={{ width: 220 }}
      className="flex flex-col h-screen bg-panel border-r border-line flex-shrink-0"
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-line flex-shrink-0">
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: "linear-gradient(135deg,#5b6ef5 0%,#3d52e8 100%)" }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="0.75" y="0.75" width="4" height="4" rx="1.1" fill="white" />
            <rect x="7.25" y="0.75" width="4" height="4" rx="1.1" fill="white" opacity="0.55" />
            <rect x="0.75" y="7.25" width="4" height="4" rx="1.1" fill="white" opacity="0.55" />
            <rect x="7.25" y="7.25" width="4" height="4" rx="1.1" fill="white" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-ink tracking-tight">AI Video Factory</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col py-3 overflow-hidden">
        {/* Primary */}
        <div className="px-2 space-y-0.5">
          {PRIMARY_NAV.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={[
                  "group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors duration-100 relative",
                  active
                    ? "bg-accent/10 text-ink font-medium"
                    : "text-ink-secondary hover:bg-hover hover:text-ink",
                ].join(" ")}
              >
                {/* Left accent bar */}
                {active && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full"
                    style={{ background: "#5b6ef5" }}
                  />
                )}
                <span className={active ? "text-accent" : "text-ink-muted group-hover:text-ink-secondary transition-colors"}>
                  <Icon />
                </span>
                {label}
              </Link>
            );
          })}
        </div>

        {/* Divider */}
        <div className="mx-3 my-3 border-t border-line" />

        {/* Secondary */}
        <div className="px-2 space-y-0.5">
          {SECONDARY_NAV.map(({ href, label, Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                className={[
                  "group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors duration-100 relative",
                  active
                    ? "bg-accent/10 text-ink font-medium"
                    : "text-ink-secondary hover:bg-hover hover:text-ink",
                ].join(" ")}
              >
                {active && (
                  <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full"
                    style={{ background: "#5b6ef5" }}
                  />
                )}
                <span className={active ? "text-accent" : "text-ink-muted group-hover:text-ink-secondary transition-colors"}>
                  <Icon />
                </span>
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Worker status — bottom */}
      <div className="px-3 pb-4 flex-shrink-0">
        <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-subtle border border-line">
          <span
            className={[
              "w-1.5 h-1.5 rounded-full flex-shrink-0",
              workerEnabled ? "bg-success animate-pulse-dot" : "bg-ink-placeholder",
            ].join(" ")}
          />
          <span className="text-xs text-ink-secondary">
            Worker <span className={workerEnabled ? "text-success-text" : "text-ink-muted"}>{workerEnabled ? "Active" : "Idle"}</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
