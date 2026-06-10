"use client";
import React from "react";

/* ── Government emblem ─────────────────────────────────── */
export function Emblem({ size = 64 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} style={{ display: "block", flexShrink: 0 }}>
      <circle cx="60" cy="60" r="58" fill="#C8102E"/>
      <circle cx="60" cy="60" r="54" fill="none" stroke="#F5D020" strokeWidth="1.5"/>
      {/* Star */}
      <polygon points="60,20 66,40 88,40 71,52 77,72 60,60 43,72 49,52 32,40 54,40" fill="#F5D020"/>
      {/* Rice stalks left */}
      <path d="M34 96 Q26 78 32 60" stroke="#F5D020" strokeWidth="2" fill="none"/>
      <path d="M32 60 Q28 56 30 52" stroke="#F5D020" strokeWidth="1.5" fill="none"/>
      <path d="M32 68 Q27 65 30 61" stroke="#F5D020" strokeWidth="1.5" fill="none"/>
      <path d="M33 76 Q26 74 30 70" stroke="#F5D020" strokeWidth="1.5" fill="none"/>
      {/* Rice stalks right */}
      <path d="M86 96 Q94 78 88 60" stroke="#F5D020" strokeWidth="2" fill="none"/>
      <path d="M88 60 Q92 56 90 52" stroke="#F5D020" strokeWidth="1.5" fill="none"/>
      <path d="M88 68 Q93 65 90 61" stroke="#F5D020" strokeWidth="1.5" fill="none"/>
      <path d="M87 76 Q94 74 90 70" stroke="#F5D020" strokeWidth="1.5" fill="none"/>
      {/* Gear / factory */}
      <circle cx="60" cy="80" r="14" fill="#F5D020"/>
      <circle cx="60" cy="80" r="8" fill="#C8102E"/>
      {/* Bottom ribbon */}
      <path d="M38 100 Q60 107 82 100" stroke="#F5D020" strokeWidth="2" fill="none"/>
    </svg>
  );
}

/* ── Citizen-at-kiosk hero illustration ────────────────── */
export function KioskScene({ width = 600 }: { width?: number }) {
  const h = width * 0.75;
  return (
    <svg viewBox="0 0 600 450" width={width} height={h} style={{ display: "block" }}>
      {/* Background circle */}
      <circle cx="300" cy="240" r="200" fill="#E8F2FB" opacity="0.6"/>
      {/* Kiosk body */}
      <rect x="200" y="120" width="200" height="280" rx="16" fill="#fff" stroke="#E2E8F0" strokeWidth="2"/>
      <rect x="212" y="132" width="176" height="130" rx="10" fill="#0068B7"/>
      <rect x="220" y="140" width="160" height="114" rx="7" fill="#004F8C"/>
      {/* Screen content on kiosk */}
      <rect x="230" y="150" width="140" height="16" rx="4" fill="rgba(255,255,255,0.2)"/>
      <rect x="230" y="172" width="100" height="10" rx="3" fill="rgba(255,255,255,0.15)"/>
      <rect x="230" y="188" width="60" height="24" rx="6" fill="#F5D020"/>
      {/* Kiosk base details */}
      <rect x="220" y="275" width="160" height="6" rx="3" fill="#E2E8F0"/>
      <rect x="260" y="285" width="80" height="40" rx="4" fill="#F1F5F9"/>
      <rect x="225" y="340" width="150" height="50" rx="8" fill="#E8F2FB"/>
      {/* Stand */}
      <rect x="265" y="400" width="70" height="16" rx="4" fill="#CBD5E1"/>
      <rect x="245" y="414" width="110" height="10" rx="3" fill="#94A3B8"/>
      {/* Citizen figure */}
      <circle cx="430" cy="200" r="38" fill="#FDE68A"/>
      {/* Hair */}
      <path d="M392 200 Q395 162 430 160 Q465 162 468 200 Q460 175 430 173 Q400 175 392 200z" fill="#1E293B"/>
      {/* Body */}
      <path d="M390 340 Q395 290 430 280 Q465 290 470 340z" fill="#0068B7"/>
      {/* Arms */}
      <path d="M395 295 Q370 310 355 330" stroke="#FDE68A" strokeWidth="20" strokeLinecap="round" fill="none"/>
      {/* Hand reaching to kiosk */}
      <circle cx="352" cy="333" r="14" fill="#FDE68A"/>
      {/* Legs */}
      <path d="M410 340 L405 430" stroke="#1E293B" strokeWidth="18" strokeLinecap="round"/>
      <path d="M450 340 L455 430" stroke="#1E293B" strokeWidth="18" strokeLinecap="round"/>
      {/* Shoes */}
      <ellipse cx="400" cy="432" rx="18" ry="8" fill="#0F172A"/>
      <ellipse cx="460" cy="432" rx="18" ry="8" fill="#0F172A"/>
      {/* Smile on face */}
      <path d="M416 212 Q430 224 444 212" stroke="#92400E" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <circle cx="420" cy="202" r="3.5" fill="#92400E"/>
      <circle cx="440" cy="202" r="3.5" fill="#92400E"/>
      {/* Floating checkmark badge */}
      <circle cx="490" cy="150" r="28" fill="#16A34A"/>
      <path d="M478 150l9 9 16-16" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

/* ── Assistant avatar ───────────────────────────────────── */
export function AssistantAvatar({ size = 48 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} style={{ display: "block", borderRadius: "50%" }}>
      <circle cx="24" cy="24" r="24" fill="var(--purple, #6D28D9)"/>
      {/* Headset */}
      <circle cx="24" cy="20" r="8" fill="rgba(255,255,255,0.9)"/>
      <path d="M14 22 Q14 14 24 14 Q34 14 34 22" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" fill="none"/>
      <rect x="12" y="21" width="5" height="8" rx="2.5" fill="rgba(255,255,255,0.7)"/>
      <rect x="31" y="21" width="5" height="8" rx="2.5" fill="rgba(255,255,255,0.7)"/>
      <path d="M29 29 Q34 30 34 35" stroke="rgba(255,255,255,0.5)" strokeWidth="2" fill="none"/>
      <circle cx="34" cy="36" r="2.5" fill="rgba(255,255,255,0.6)"/>
      {/* Face */}
      <circle cx="21" cy="20" r="1.5" fill="var(--purple, #6D28D9)"/>
      <circle cx="27" cy="20" r="1.5" fill="var(--purple, #6D28D9)"/>
      <path d="M21 23 Q24 26 27 23" stroke="var(--purple, #6D28D9)" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
    </svg>
  );
}

/* ── Success mark ───────────────────────────────────────── */
export function SuccessMark({ size = 120 }: { size?: number }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} style={{ display: "block" }}>
      <circle cx="60" cy="60" r="58" fill="var(--green-lt, #DCFCE7)"/>
      <circle cx="60" cy="60" r="44" fill="var(--green, #16A34A)"/>
      <path d="M38 60l16 16 28-28" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      {/* Accent dots */}
      <circle cx="60" cy="10" r="5" fill="var(--green, #16A34A)" opacity="0.4"/>
      <circle cx="110" cy="60" r="5" fill="var(--green, #16A34A)" opacity="0.4"/>
      <circle cx="60" cy="110" r="5" fill="var(--green, #16A34A)" opacity="0.4"/>
      <circle cx="10" cy="60" r="5" fill="var(--green, #16A34A)" opacity="0.4"/>
    </svg>
  );
}
