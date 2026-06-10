"use client";
import React from "react";

/* All icons at 24×24 viewBox */
const P = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.8 as unknown as number,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

type IconName =
  | "submit" | "wallet" | "queue" | "search" | "ai" | "rate" | "home" | "back"
  | "help" | "chip" | "qr" | "user" | "shield" | "doc" | "scan" | "mic"
  | "print" | "calendar" | "ticket" | "check" | "x" | "arrow" | "plus"
  | "hotich" | "cutru" | "cccd" | "chungthuc" | "datdai" | "kinhdoanh"
  | "star" | "send" | "loader";

const PATHS: Record<string, React.ReactNode> = {
  submit: <><path {...P} d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/></>,
  wallet: <><rect {...P} x="2" y="7" width="20" height="14" rx="3"/><path {...P} d="M16 3L8 7M2 12h20"/><circle fill="currentColor" stroke="none" cx="17" cy="16" r="1.5"/></>,
  queue: <><rect {...P} x="9" y="2" width="6" height="6" rx="1"/><rect {...P} x="3" y="10" width="6" height="6" rx="1"/><rect {...P} x="15" y="10" width="6" height="6" rx="1"/><path {...P} d="M12 8v2M6 13H3v3M21 13h-3v3"/></>,
  search: <><circle {...P} cx="11" cy="11" r="8"/><path {...P} d="M21 21l-4.35-4.35"/></>,
  ai: <><path {...P} d="M12 2a4 4 0 014 4v1a4 4 0 01-8 0V6a4 4 0 014-4zM6 21v-1a6 6 0 0112 0v1"/><circle {...P} cx="12" cy="9" r="1" fill="currentColor" stroke="none"/><path {...P} d="M8 15c0-1 2-2 4-2s4 1 4 2"/></>,
  rate: <><polygon {...P} points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
  home: <><path {...P} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline {...P} points="9 22 9 12 15 12 15 22"/></>,
  back: <><polyline {...P} points="15 18 9 12 15 6"/></>,
  help: <><circle {...P} cx="12" cy="12" r="10"/><path {...P} d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><circle fill="currentColor" stroke="none" cx="12" cy="17" r="1"/></>,
  chip: <><rect {...P} x="5" y="5" width="14" height="14" rx="3"/><rect {...P} x="9" y="9" width="6" height="6"/><path {...P} d="M9 5V3M15 5V3M9 21v-2M15 21v-2M5 9H3M5 15H3M21 9h-2M21 15h-2"/></>,
  qr: <><rect {...P} x="3" y="3" width="7" height="7" rx="1"/><rect {...P} x="14" y="3" width="7" height="7" rx="1"/><rect {...P} x="3" y="14" width="7" height="7" rx="1"/><rect fill="currentColor" stroke="none" x="5" y="5" width="3" height="3"/><rect fill="currentColor" stroke="none" x="16" y="5" width="3" height="3"/><rect fill="currentColor" stroke="none" x="5" y="16" width="3" height="3"/><path {...P} d="M14 14h3v3M17 17h3v3M14 20h3"/></>,
  user: <><circle {...P} cx="12" cy="8" r="5"/><path {...P} d="M3 21c0-4.4 4-8 9-8s9 3.6 9 8"/></>,
  shield: <><path {...P} d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></>,
  doc: <><path {...P} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline {...P} points="14 2 14 8 20 8"/><line {...P} x1="16" y1="13" x2="8" y2="13"/><line {...P} x1="16" y1="17" x2="8" y2="17"/><polyline {...P} points="10 9 9 9 8 9"/></>,
  scan: <><path {...P} d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/><line {...P} x1="3" y1="12" x2="21" y2="12"/></>,
  mic: <><path {...P} d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path {...P} d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/></>,
  print: <><polyline {...P} points="6 9 6 2 18 2 18 9"/><path {...P} d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect {...P} x="6" y="14" width="12" height="8"/></>,
  calendar: <><rect {...P} x="3" y="4" width="18" height="18" rx="2"/><line {...P} x1="16" y1="2" x2="16" y2="6"/><line {...P} x1="8" y1="2" x2="8" y2="6"/><line {...P} x1="3" y1="10" x2="21" y2="10"/></>,
  ticket: <><path {...P} d="M2 9a2 2 0 002 2 2 2 0 000 4 2 2 0 00-2 2v1a1 1 0 001 1h18a1 1 0 001-1v-1a2 2 0 00-2-2 2 2 0 000-4 2 2 0 002-2V8a1 1 0 00-1-1H3a1 1 0 00-1 1v1z"/><line {...P} x1="9" y1="7" x2="9" y2="17"/></>,
  check: <><polyline {...P} points="20 6 9 17 4 12"/></>,
  x: <><line {...P} x1="18" y1="6" x2="6" y2="18"/><line {...P} x1="6" y1="6" x2="18" y2="18"/></>,
  arrow: <><line {...P} x1="5" y1="12" x2="19" y2="12"/><polyline {...P} points="12 5 19 12 12 19"/></>,
  plus: <><line {...P} x1="12" y1="5" x2="12" y2="19"/><line {...P} x1="5" y1="12" x2="19" y2="12"/></>,
  star: <><polygon {...P} points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></>,
  send: <><line {...P} x1="22" y1="2" x2="11" y2="13"/><polygon {...P} points="22 2 15 22 11 13 2 9 22 2"/></>,
  loader: <><path {...P} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0" strokeLinecap="round" opacity="0.25"/><path {...P} d="M21 12a9 9 0 00-9-9" strokeLinecap="round"/></>,
  /* Category icons */
  hotich:    <><circle {...P} cx="12" cy="8" r="4"/><path {...P} d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/><path {...P} d="M15 4l2 2-2 2"/></>,
  cutru:     <><path {...P} d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path {...P} d="M9 22V12h6v10"/></>,
  cccd:      <><rect {...P} x="2" y="5" width="20" height="14" rx="2"/><circle {...P} cx="8" cy="12" r="2.5"/><path {...P} d="M13 9h6M13 12h5M13 15h4"/></>,
  chungthuc: <><path {...P} d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path {...P} d="M14 2v6h6M9 13l2 2 4-4"/></>,
  datdai:    <><path {...P} d="M3 21h18M9 21V7l3-4 3 4v14M3 21V11l3-4"/><path {...P} d="M21 21V11l-3-4"/></>,
  kinhdoanh: <><path {...P} d="M3 9h18v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z"/><path {...P} d="M3 9l2-5h14l2 5"/><path {...P} d="M12 9v12M9 14h6"/></>,
};

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
  className?: string;
}

export function Icon({ name, size = 24, color, style, className }: IconProps) {
  const path = PATHS[name] ?? PATHS["doc"];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={{ color, flexShrink: 0, display: "block", ...style }}
      className={className}
    >
      {path}
    </svg>
  );
}
