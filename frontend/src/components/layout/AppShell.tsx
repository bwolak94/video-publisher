"use client";
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/Badge";

const NAV_SECTIONS = [
  {
    title: "PRODUKCJA",
    items: [
      { label: "Pulpit", href: "/dashboard", icon: "⊞" },
      { label: "Nowy Short", href: "/shorts/new", icon: "+" },
      { label: "Odcinki", href: "/shorts", icon: "▶" },
      { label: "Do akceptacji", href: "/shorts/review", icon: "✓", badge: true },
    ],
  },
  {
    title: "BIBLIOTEKA",
    items: [
      { label: "Character Bible", href: "/library/characters", icon: "👤" },
      { label: "Likeness Vault", href: "/library/likeness-vault", icon: "🔒" },
      { label: "Profile nisz", href: "/library/niche-profiles", icon: "◎" },
      { label: "Klipy źródłowe", href: "/library/source-clips", icon: "🎬" },
      { label: "Modele i ceny", href: "/library/models-pricing", icon: "$" },
    ],
  },
  {
    title: "USTAWIENIA",
    items: [
      { label: "Workspace", href: "/workspace", icon: "⚙" },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    fetch("/api/scenes/pending-review-count")
      .then((r) => r.json())
      .then((d) => setPendingCount(d?.count ?? 0))
      .catch(() => {});
  }, []);

  return (
    <div className="vf-shell" style={{ minHeight: "100vh" }}>
      {/* Sidebar */}
      <aside className="vf-side">
        <div className="vf-auth-brand">
          <div className="vf-mark">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <polygon points="2,1 11,6 2,11" />
            </svg>
          </div>
          Video Factory
        </div>

        <nav className="vf-nav" style={{ flex: 1 }}>
          {NAV_SECTIONS.map((section) => (
            <div key={section.title}>
              <div className="vf-nav-h">{section.title}</div>
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                const count = item.badge ? pendingCount : 0;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <span style={{ fontSize: 14, width: 18, textAlign: "center" }}>
                      {item.icon}
                    </span>
                    {item.label}
                    {item.badge && count > 0 && (
                      <Badge tone="warn" className="vf-badge">
                        {count}
                      </Badge>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="vf-side-foot">
          {/* Budget bar */}
          <div className="vf-progress">
            <div className="vf-progress-top">
              <span style={{ fontSize: 12, color: "var(--ink-muted)" }}>Budżet miesięczny</span>
              <span
                style={{
                  fontSize: 12,
                  fontFamily: "var(--font-mono)",
                  color: "var(--ink-muted)",
                }}
              >
                $0 / $50
              </span>
            </div>
            <div className="vf-track">
              <div className="vf-fill" style={{ width: "0%" }} />
            </div>
          </div>

          {/* User row */}
          <div className="vf-user">
            <div className="vf-avatar">B</div>
            <div className="vf-user-meta">
              <span style={{ color: "var(--ink)", fontWeight: 500 }}>Bartosz</span>
              <span>operator</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="vf-main">{children}</div>
    </div>
  );
}
