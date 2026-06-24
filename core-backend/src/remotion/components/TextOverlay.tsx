import React from "react";

export type TextStyle = "standard" | "punchy" | "funny_sub";
export type TextPosition = "top" | "center" | "bottom";

export interface TextOverlayProps {
  text: string;
  style: TextStyle;
  position?: TextPosition;
}

const POSITION_STYLE: Record<TextPosition, React.CSSProperties> = {
  top: { top: "5%", bottom: "auto" },
  center: { top: "50%", transform: "translateY(-50%)", bottom: "auto" },
  bottom: { bottom: "5%", top: "auto" },
};

const TEXT_STYLE_CLASS: Record<TextStyle, string> = {
  standard: "overlay-standard",
  punchy: "overlay-punchy",
  funny_sub: "overlay-funny-sub",
};

export function getTextStyleClass(style: TextStyle): string {
  return TEXT_STYLE_CLASS[style];
}

const baseStyle: React.CSSProperties = {
  position: "absolute",
  left: "5%",
  right: "5%",
  textAlign: "center",
  fontFamily: "Inter-Bold, sans-serif",
  fontSize: 48,
  color: "#ffffff",
  textShadow: "0 2px 8px rgba(0,0,0,0.8)",
  zIndex: 10,
};

const FONT_SIZE: Record<TextStyle, number> = {
  standard: 48,
  punchy: 64,
  funny_sub: 40,
};

export const TextOverlay: React.FC<TextOverlayProps> = ({
  text,
  style,
  position = "bottom",
}) => {
  return (
    <div
      className={getTextStyleClass(style)}
      style={{
        ...baseStyle,
        ...POSITION_STYLE[position],
        fontSize: FONT_SIZE[style],
      }}
    >
      {text}
    </div>
  );
};
