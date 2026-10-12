import React from "react";

interface FrameProps {
  src?: string;
  alt?: string;
  tag?: string;
  busy?: boolean | string;
  figure?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export function Frame({
  src,
  alt = "",
  tag,
  busy,
  figure = true,
  className = "",
  style,
  children,
}: FrameProps) {
  const isVideo = src ? /\.(mp4|webm|ogg)$/i.test(src) : false;

  return (
    <div
      className={["vf-frame", className].filter(Boolean).join(" ")}
      style={style}
    >
      {src && !isVideo && <img src={src} alt={alt} />}
      {src && isVideo && (
        <video src={src} autoPlay muted loop playsInline />
      )}
      {!src && figure !== false && (
        <div className="vf-frame-shape" aria-hidden="true" />
      )}
      {tag && <span className="vf-frame-tag">{tag}</span>}
      {busy && (
        <div className="vf-frame-busy">
          <div>
            <span className="vf-spin" aria-hidden="true" />
            {typeof busy === "string" && <span>{busy}</span>}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
