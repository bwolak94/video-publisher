import React from "react";

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="vf-auth" style={{ minHeight: "100vh" }}>
      {/* Left: form column */}
      <div className="vf-auth-main">
        <div className="vf-auth-brand">
          <div className="vf-mark">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <polygon points="3,1 13,7 3,13" />
            </svg>
          </div>
          Video Factory
        </div>
        <div className="vf-auth-form">
          <div>
            <h1 className="vf-auth-h">{title}</h1>
            {subtitle && <p className="vf-auth-sub">{subtitle}</p>}
          </div>
          {children}
        </div>
        <div className="vf-auth-foot">
          <span>© 2026 Video Factory</span>
        </div>
      </div>

      {/* Right: brand panel — aria-hidden, hidden on mobile */}
      <aside
        className="vf-auth-aside"
        aria-hidden="true"
        style={{ display: "none" }}
      >
        <div className="vf-reel">
          <div className="vf-frame" style={{ width: "30%" }}>
            <div className="vf-frame-shape" />
          </div>
          <div
            className="vf-frame"
            style={{
              width: "36%",
              borderColor: "var(--accent)",
              boxShadow: "0 0 0 1px var(--accent)",
            }}
          >
            <div className="vf-frame-shape" />
          </div>
          <div className="vf-frame" style={{ width: "30%" }}>
            <div className="vf-frame-shape" />
          </div>
        </div>
        <p className="vf-quote">
          Od briefu do <em>gotowego shorta</em> w kilka minut.
        </p>
        <div className="vf-reel-pipe">
          {["Brief", "Scene Plan", "T2I", "I2V", "QA", "Export"].map((step) => (
            <span key={step} className="vf-badge">
              {step}
            </span>
          ))}
        </div>
      </aside>

      <style>{`
        @media (min-width: 760px) {
          .vf-auth-aside { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
