import type { Config } from "tailwindcss";

// ─── Design System ──────────────────────────────────────────────────────────
//
// Three-layer background system:
//   app    #07090f  — page canvas (deepest)
//   panel  #0d1117  — sidebar, main panels
//   subtle #131824  — card surfaces
//   muted  #1a2030  — inset areas, code blocks
//   hover  #1e2538  — hover states
//
// Single accent: #5b6ef5 (used SPARINGLY — interactive only)
// Hairline borders: rgba(255,255,255,0.07) — almost-invisible structure

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    // Override defaults with a precise design system
    fontSize: {
      "2xs": ["11px", { lineHeight: "16px", letterSpacing: "0.01em" }],
      xs:    ["12px", { lineHeight: "16px" }],
      sm:    ["13px", { lineHeight: "20px" }],
      base:  ["14px", { lineHeight: "22px" }],
      md:    ["15px", { lineHeight: "24px" }],
      lg:    ["16px", { lineHeight: "24px" }],
      xl:    ["18px", { lineHeight: "28px" }],
      "2xl": ["20px", { lineHeight: "28px" }],
      "3xl": ["24px", { lineHeight: "32px" }],
      "4xl": ["28px", { lineHeight: "36px" }],
      "5xl": ["32px", { lineHeight: "40px" }],
    },
    fontWeight: {
      normal:   "400",
      medium:   "500",
      semibold: "600",
      bold:     "700",
    },
    borderRadius: {
      none: "0",
      sm:   "4px",
      DEFAULT: "6px",
      md:   "8px",
      lg:   "10px",
      xl:   "12px",
      "2xl": "16px",
      "3xl": "20px",
      full: "9999px",
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        // ── New clean tokens ──────────────────────────────
        app:    "#07090f",
        panel:  "#0d1117",
        subtle: "#131824",
        muted:  "#1a2030",
        hover:  "#1e2538",
        line:   "rgba(255,255,255,0.07)",
        "line-strong": "rgba(255,255,255,0.12)",
        ink: {
          DEFAULT:     "#e2e8f5",
          secondary:   "#8892a4",
          muted:       "#505b70",
          placeholder: "#3d4657",
        },
        accent: {
          DEFAULT: "#5b6ef5",
          hover:   "#6b7ef7",
          muted:   "rgba(91,110,245,0.12)",
          border:  "rgba(91,110,245,0.25)",
          glow:    "rgba(91,110,245,0.3)",
        },

        // ── Backward-compatible aliases (old components) ──
        // Maps old token names → new color values
        surface: {
          base:    "#07090f",   // was #0f1117
          raised:  "#0d1117",   // was #1a1f2e
          overlay: "#131824",   // was #252b3b
          border:  "rgba(255,255,255,0.07)",  // was #2d3448
          muted:   "#1a2030",   // was #1e2538
        },
        text: {
          primary:   "#e2e8f5",  // was #f1f5f9
          secondary: "#8892a4",  // was #94a3b8
          muted:     "#505b70",  // was #64748b
          inverse:   "#07090f",
        },
        violet: {
          dim:    "rgba(91,110,245,0.08)",
          base:   "#5b6ef5",    // was #7c3aed
          bright: "#6b7ef7",    // was #8b5cf6
          glow:   "#818cf8",    // was #c4b5fd
        },
        neon: {
          dim:  "rgba(22,163,74,0.12)",
          base: "#16a34a",
          glow: "#4ade80",
        },
        warn: {
          base: "#d97706",
          glow: "#fbbf24",
        },
        error: {
          dim:  "rgba(220,38,38,0.12)",
          base: "#dc2626",
          glow: "#f87171",
        },
        info: {
          dim:  "rgba(37,99,235,0.12)",
          base: "#2563eb",
          glow: "#60a5fa",
        },

        // ── Semantic (new-style) ──────────────────────────
        success: { DEFAULT: "#16a34a", bg: "rgba(22,163,74,0.12)", text: "#4ade80", border: "rgba(22,163,74,0.2)" },
        warning: { DEFAULT: "#d97706", bg: "rgba(217,119,6,0.12)",  text: "#fbbf24", border: "rgba(217,119,6,0.2)" },
        danger:  { DEFAULT: "#dc2626", bg: "rgba(220,38,38,0.12)",  text: "#f87171", border: "rgba(220,38,38,0.2)" },
      },
      backgroundImage: {
        // Old compat
        "gradient-violet": "linear-gradient(135deg, #5b6ef5 0%, #3d52e8 100%)",
        "gradient-hero":   "linear-gradient(135deg, rgba(91,110,245,0.05) 0%, transparent 60%)",
        "gradient-card":   "linear-gradient(135deg, rgba(255,255,255,0.02) 0%, transparent 50%)",
        // New
        "accent-gradient": "linear-gradient(135deg, #5b6ef5 0%, #3d52e8 100%)",
        "panel-gradient":  "linear-gradient(180deg, #0d1117 0%, #0a0d14 100%)",
        "subtle-gradient": "linear-gradient(135deg, rgba(91,110,245,0.06) 0%, transparent 60%)",
        "card-shine":      "linear-gradient(135deg, rgba(255,255,255,0.025) 0%, transparent 50%)",
      },
      boxShadow: {
        // Old compat
        "card":       "0 1px 3px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)",
        "card-hover": "0 4px 16px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)",
        "glow-violet":"0 0 20px rgba(91,110,245,0.25)",
        "glow-neon":  "0 0 20px rgba(22,163,74,0.25)",
        // New
        "xs":       "0 1px 2px rgba(0,0,0,0.4)",
        "sm":       "0 2px 8px rgba(0,0,0,0.5)",
        "md":       "0 4px 16px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.4)",
        "lg":       "0 8px 32px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4)",
        "accent":   "0 0 0 3px rgba(91,110,245,0.25)",
        "accent-sm":"0 0 0 2px rgba(91,110,245,0.3)",
        "glow":     "0 0 24px rgba(91,110,245,0.2)",
        "inner-t":  "inset 0 1px 0 rgba(255,255,255,0.05)",
        "inset":    "inset 0 1px 3px rgba(0,0,0,0.4)",
      },
      keyframes: {
        // Old compat
        "fade-up":    { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "slide-in":   { from: { opacity: "0", transform: "translateX(12px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        "pulse-slow": { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.5" } },
        // New
        "in":         { from: { opacity: "0", transform: "translateY(4px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "in-left":    { from: { opacity: "0", transform: "translateX(-6px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        "in-scale":   { from: { opacity: "0", transform: "scale(0.97)" }, to: { opacity: "1", transform: "scale(1)" } },
        "pulse-dot":  { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.3" } },
        "shimmer":    { "0%": { backgroundPosition: "-200% 0" }, "100%": { backgroundPosition: "200% 0" } },
      },
      animation: {
        // Old compat
        "fade-up":    "fade-up 0.2s ease-out both",
        "slide-in":   "slide-in 0.2s ease-out both",
        "pulse-slow": "pulse-slow 2s ease-in-out infinite",
        // New
        "in":        "in 0.15s ease-out",
        "in-left":   "in-left 0.18s ease-out",
        "in-scale":  "in-scale 0.15s ease-out",
        "pulse-dot": "pulse-dot 2s ease-in-out infinite",
        "shimmer":   "shimmer 1.5s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
