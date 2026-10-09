import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
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
      xs:   "4px",
      sm:   "6px",
      DEFAULT: "8px",
      md:   "10px",
      lg:   "14px",
      xl:   "20px",
      "2xl": "24px",
      pill: "999px",
      full: "9999px",
    },
    extend: {
      fontFamily: {
        display: ["Bricolage Grotesque", "Geist", "system-ui", "sans-serif"],
        sans: ["Geist", "system-ui", "-apple-system", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        // ── VF Layer tokens ──────────────────────────────
        bg:              "var(--bg)",
        surface: {
          DEFAULT:       "var(--surface)",
          raised:        "var(--surface-raised)",
          sunken:        "var(--surface-sunken)",
        },
        line: {
          DEFAULT:       "var(--line)",
          strong:        "var(--line-strong)",
        },
        ink: {
          DEFAULT:       "var(--ink)",
          muted:         "var(--ink-muted)",
          faint:         "var(--ink-faint)",
        },
        accent: {
          DEFAULT:       "var(--accent)",
          hover:         "var(--accent-hover)",
          soft:          "var(--accent-soft)",
          text:          "var(--accent-text)",
        },
        "on-accent":     "var(--on-accent)",
        focus:           "var(--focus)",
        info: {
          DEFAULT:       "var(--info)",
          soft:          "var(--info-soft)",
        },
        warn: {
          DEFAULT:       "var(--warn)",
          soft:          "var(--warn-soft)",
        },
        danger: {
          DEFAULT:       "var(--danger)",
          soft:          "var(--danger-soft)",
        },
        "on-danger":     "var(--on-danger)",
        overlay:         "var(--overlay)",

        // ── Legacy aliases (keep existing pages working) ─
        app:    "#0c0d0f",
        panel:  "#141518",
        subtle: "#1b1d21",
        muted:  "#1b1d21",
        hover:  "#1b1d21",
        "ink-secondary":   "var(--ink-muted)",
        "ink-placeholder": "var(--ink-faint)",
        success: { DEFAULT: "#4ade80", bg: "rgba(74,222,128,0.12)", text: "#4ade80", border: "rgba(74,222,128,0.2)" },
        warning: { DEFAULT: "var(--warn)", bg: "var(--warn-soft)", text: "var(--warn)", border: "var(--warn-soft)" },
      },
      spacing: {
        "space-1":  "4px",
        "space-2":  "8px",
        "space-3":  "12px",
        "space-4":  "16px",
        "space-5":  "20px",
        "space-6":  "24px",
        "space-8":  "32px",
        "space-12": "48px",
      },
      boxShadow: {
        pop:        "var(--shadow-pop)",
        "inner-t":  "inset 0 1px 0 rgba(255,255,255,0.05)",
        "card":     "0 1px 3px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)",
        "card-hover":"0 4px 16px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)",
      },
      keyframes: {
        "fade-up":    { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "slide-in":   { from: { opacity: "0", transform: "translateX(12px)" }, to: { opacity: "1", transform: "translateX(0)" } },
        "pulse-dot":  { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.3" } },
        "vf-rot":     { to: { transform: "rotate(360deg)" } },
        "vf-pulse":   { "50%": { opacity: "0.35" } },
      },
      animation: {
        "fade-up":    "fade-up 0.2s ease-out both",
        "slide-in":   "slide-in 0.2s ease-out both",
        "pulse-dot":  "pulse-dot 2s ease-in-out infinite",
        "vf-rot":     "vf-rot 0.7s linear infinite",
        "vf-pulse":   "vf-pulse 1.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
