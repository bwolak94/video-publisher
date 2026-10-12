import React from "react";

interface CoverProps {
  className?: string;
}

export function Cover({ className = "" }: CoverProps) {
  return (
    <div
      className={["vf-cover", className].filter(Boolean).join(" ")}
      style={{ position: "relative", overflow: "hidden", height: 288 }}
    >
      {/* Artwork panel — staggered 9:16 film frames with film-strip perforations */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 0,
          left: 480,
          width: 480,
          height: 288,
          overflow: "hidden",
        }}
      >
        <svg
          viewBox="0 0 480 288"
          width="480"
          height="288"
          style={{ display: "block" }}
        >
          {/* Film strip */}
          <rect
            style={{
              fill: "var(--surface-sunken)",
              stroke: "var(--line)",
              strokeWidth: 1,
            }}
            x="0"
            y="40"
            width="520"
            height="56"
            rx="4"
          />
          {/* Top row of perforations */}
          {[16, 48, 80, 112, 144, 176, 208, 240, 272, 304, 336, 368, 400, 432, 464].map(
            (x) => (
              <rect
                key={`tp-${x}`}
                style={{ fill: "var(--bg)" }}
                x={x}
                y="48"
                width="8"
                height="8"
                rx="2"
              />
            )
          )}
          {/* Bottom row of perforations */}
          {[16, 48, 80, 112, 144, 176, 208, 240, 272, 304, 336, 368, 400, 432, 464].map(
            (x) => (
              <rect
                key={`bp-${x}`}
                style={{ fill: "var(--bg)" }}
                x={x}
                y="80"
                width="8"
                height="8"
                rx="2"
              />
            )
          )}
          {/* Left secondary frame (surface-raised) */}
          <rect
            style={{
              fill: "var(--surface-raised)",
              stroke: "var(--line-strong)",
              strokeWidth: 1,
            }}
            x="40"
            y="96"
            width="90"
            height="160"
            rx="14"
          />
          {/* Centre accent frame (largest, foreground) */}
          <rect
            style={{ fill: "var(--accent)" }}
            x="146"
            y="32"
            width="126"
            height="224"
            rx="14"
          />
          {/* Perforations cut into accent frame top band */}
          {[162, 178, 194].map((x) => (
            <rect
              key={`ap-${x}`}
              style={{ fill: "var(--bg)" }}
              x={x}
              y="48"
              width="8"
              height="8"
              rx="2"
            />
          ))}
          {/* Right secondary frame (surface-raised) */}
          <rect
            style={{
              fill: "var(--surface-raised)",
              stroke: "var(--line-strong)",
              strokeWidth: 1,
            }}
            x="288"
            y="96"
            width="90"
            height="160"
            rx="14"
          />
          {/* Far-right sunk frame (bleeding) */}
          <rect
            style={{
              fill: "var(--surface-sunken)",
              stroke: "var(--line)",
              strokeWidth: 1,
            }}
            x="394"
            y="128"
            width="90"
            height="128"
            rx="14"
          />
          {/* Info chip — "generating" */}
          <rect
            style={{ fill: "var(--info)" }}
            x="56"
            y="112"
            width="24"
            height="8"
            rx="4"
          />
          {/* Warn chip — "review" */}
          <rect
            style={{ fill: "var(--warn)" }}
            x="304"
            y="112"
            width="24"
            height="8"
            rx="4"
          />
        </svg>
      </div>

      {/* Text content */}
      <div
        style={{
          position: "absolute",
          left: "var(--space-8)",
          bottom: "var(--space-8)",
          maxWidth: 440,
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: 76,
            lineHeight: 0.95,
            fontWeight: 600,
            letterSpacing: "-0.025em",
            color: "var(--ink)",
          }}
        >
          Video
          <br />
          Factory
        </p>
        <p
          style={{
            margin: "var(--space-3) 0 0 2px",
            fontSize: 14,
            lineHeight: "20px",
            color: "var(--ink-muted)",
          }}
        >
          Generative Shorts Pipeline — od briefu do gotowego Shorta
        </p>
      </div>
    </div>
  );
}
