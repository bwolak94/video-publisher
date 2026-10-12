"use client";
import React from "react";

type IconName =
  | "check"
  | "x"
  | "plus"
  | "play"
  | "refresh"
  | "arrowRight"
  | "chevronDown"
  | "chevronRight"
  | "clock"
  | "alert"
  | "info"
  | "mail"
  | "lock"
  | "eye"
  | "eyeOff"
  | "user"
  | "users"
  | "film"
  | "image"
  | "mic"
  | "music"
  | "wave"
  | "shield"
  | "scan"
  | "layers"
  | "grid"
  | "sliders"
  | "logout"
  | "coin"
  | "upload"
  | "download"
  | "scissors"
  | "cpu"
  | "tag"
  | "copy"
  | "trash"
  | "link"
  | "camera"
  | "bolt"
  | "globe"
  | "code"
  | "book"
  | "target";

interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
}

// PATHS — copied exactly from bundle.js, with C9(cx,cy,r) calls expanded to literal strings.
// C9(cx,cy,r) = 'M'+(cx-r)+' '+cy+'a'+r+' '+r+' 0 1 0 '+(2*r)+' 0a'+r+' '+r+' 0 1 0 '+(-2*r)+' 0'
//
// Expansions used below:
//   C9(12,12,9)    → 'M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0'
//   C9(12,12,2.5)  → 'M9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0'
//   C9(12,8,4)     → 'M8 8a4 4 0 1 0 8 0a4 4 0 1 0 -8 0'
//   C9(9,8,3.5)    → 'M5.5 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0'
//   C9(6,18,3)     → 'M3 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0'
//   C9(17,16,3)    → 'M14 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0'
//   C9(15.5,8.5,1.2)→'M14.3 8.5a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0'
//   C9(6,6,3)      → 'M3 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0'
//   C9(12,12,4.5)  → 'M7.5 12a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0'
const PATHS: Record<IconName, string[]> = {
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  x: ["M6 6l12 12M18 6L6 18"],
  plus: ["M12 5v14M5 12h14"],
  play: ["M8 5.5v13l10.5-6.5z"],
  refresh: ["M20 11a8 8 0 1 0-2.3 5.7", "M20 4v7h-7"],
  arrowRight: ["M5 12h14M13 6l6 6-6 6"],
  chevronDown: ["M6 9l6 6 6-6"],
  chevronRight: ["M9 6l6 6-6 6"],
  clock: ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M12 7v5l3 2"],
  alert: ["M12 3.5l9.5 16.5h-19z", "M12 10v4", "M12 17v.5"],
  info: ["M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M12 11v5", "M12 7.5v.5"],
  mail: ["M3.5 6h17v12h-17z", "M3.5 7l8.5 6 8.5-6"],
  lock: ["M6 11h12v9H6z", "M8.5 11V8a3.5 3.5 0 0 1 7 0v3"],
  eye: [
    "M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z",
    "M9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0",
  ],
  eyeOff: [
    "M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z",
    "M9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0",
    "M4 4l16 16",
  ],
  user: ["M8 8a4 4 0 1 0 8 0a4 4 0 1 0 -8 0", "M4.5 20a7.5 7.5 0 0 1 15 0"],
  users: [
    "M5.5 8a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0",
    "M2.5 19.5a6.5 6.5 0 0 1 13 0",
    "M15 4.8a3.5 3.5 0 0 1 0 6.4",
    "M18 13.5a6.5 6.5 0 0 1 3.5 6",
  ],
  film: [
    "M4 3.5h16v17H4z",
    "M8 3.5v17M16 3.5v17M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4",
  ],
  image: [
    "M4 4h16v16H4z",
    "M4 16l5-5 4 4 2.5-2.5L20 17",
    "M14.3 8.5a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0",
  ],
  mic: [
    "M9 6a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0z",
    "M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21",
  ],
  music: [
    "M9 18V5l11-2v13",
    "M3 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
    "M14 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  ],
  wave: ["M3 12h2l2-6 3 12 3-9 2 6 2-3h4"],
  shield: [
    "M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z",
    "M8.5 12l2.5 2.5 4.5-5",
  ],
  scan: [
    "M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4",
    "M9 10v1M15 10v1",
    "M9.5 15c1.5 1 3.5 1 5 0",
  ],
  layers: ["M12 3l9 5-9 5-9-5z", "M3 13l9 5 9-5"],
  grid: ["M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"],
  sliders: [
    "M4 7h10M18 7h2M4 17h4M12 17h8",
    "M14 5v4M8 15v4",
  ],
  logout: ["M14 4h5v16h-5", "M10 8l-4 4 4 4M6 12h9"],
  coin: [
    "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0",
    "M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.4 0-2.5.8-2.5 2s1.1 1.7 2.5 2 2.5.8 2.5 2-1.1 2-2.5 2c-1 0-2-.5-2.5-1.5M12 6.5V8M12 16v1.5",
  ],
  upload: ["M12 15V4M7 9l5-5 5 5M4 15v5h16v-5"],
  download: ["M12 4v11M7 10l5 5 5-5M4 15v5h16v-5"],
  scissors: [
    "M3 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
    "M3 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
    "M8.2 7.8L20 19M8.2 16.2L20 5",
  ],
  cpu: [
    "M7 7h10v10H7z",
    "M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4",
  ],
  tag: ["M3 12V4h8l10 10-8 8z", "M7.5 7.5v.5"],
  copy: ["M8 8h12v12H8z", "M4 16V4h12"],
  trash: ["M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"],
  link: [
    "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1",
    "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  ],
  camera: [
    "M4 7h3l2-3h6l2 3h3v12H4z",
    "M9 13a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  ],
  bolt: ["M13 3L5 13h6l-1 8 8-10h-6z"],
  globe: [
    "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0",
    "M3 12h18",
    "M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z",
  ],
  code: ["M8 7l-5 5 5 5M16 7l5 5-5 5"],
  book: [
    "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z",
    "M5 17a3 3 0 0 1 3-3h11",
  ],
  target: [
    "M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0",
    "M7.5 12a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0 -9 0",
    "M12 11.5v1",
  ],
};

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.75,
  label,
  className = "",
}: IconProps) {
  const paths = PATHS[name] ?? PATHS.info;
  return (
    <svg
      className={["vf-icon", className].filter(Boolean).join(" ")}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

Icon.names = Object.keys(PATHS) as IconName[];
