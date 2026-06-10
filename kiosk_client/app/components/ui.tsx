"use client";
import React, { useState, useEffect } from "react";
import { Emblem } from "./illustrations";
import { Icon } from "./icons";

/* ── Clock hook ────────────────────────────────────────── */
export function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function pad(n: number) { return n.toString().padStart(2, "0"); }

/* ── TopBar — shared header (height 104px) ─────────────── */
interface TopBarProps {
  title?: string;
  subtitle?: string;
  lang: "vi" | "en";
  onLangChange: (l: "vi" | "en") => void;
  onHome: () => void;
  onHelp: () => void;
}

export function TopBar({ title, subtitle, lang, onLangChange, onHome, onHelp }: TopBarProps) {
  const now = useClock();
  const blink = now.getSeconds() % 2 === 0;
  const timeStr = `${pad(now.getHours())}${blink ? ":" : " "}${pad(now.getMinutes())}`;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 20,
      height: 104, padding: "0 40px", flexShrink: 0,
      background: "#fff", borderBottom: "1.5px solid var(--ink-7)",
      boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
    }}>
      {/* Emblem + org name */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <Emblem size={60} />
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--blue)", marginBottom: 2 }}>
            Cổng dịch vụ công quốc gia
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "var(--ink-0)", lineHeight: 1.2 }}>
            Trung tâm Phục vụ Hành chính Công
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 1 }}>
            UBND Phường Cửa Nam · Quận Hoàn Kiếm · Hà Nội
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {/* Page title (center) */}
      {title && (
        <div style={{ textAlign: "center", position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink-0)" }}>{title}</div>
          {subtitle && <div style={{ fontSize: 14, color: "var(--ink-4)", marginTop: 2 }}>{subtitle}</div>}
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* Clock */}
      <div style={{ textAlign: "right", flexShrink: 0, marginRight: 16 }}>
        <div style={{ fontSize: 36, fontWeight: 800, color: "var(--ink-0)", fontVariantNumeric: "tabular-nums", letterSpacing: "-.02em", lineHeight: 1 }}>
          {timeStr}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 2 }}>
          {["CN","T2","T3","T4","T5","T6","T7"][now.getDay()]}, {pad(now.getDate())}/{pad(now.getMonth()+1)}/{now.getFullYear()}
        </div>
      </div>

      {/* Divider */}
      <div style={{ width: 1, height: 44, background: "var(--ink-7)", flexShrink: 0 }} />

      {/* Actions */}
      <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
        <button
          onClick={() => onLangChange(lang === "vi" ? "en" : "vi")}
          style={{
            height: 44, padding: "0 16px", borderRadius: 10,
            background: "var(--ink-8)", border: "1.5px solid var(--ink-7)",
            fontSize: 14, fontWeight: 800, color: "var(--blue)", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <Icon name="home" size={16} style={{ color: "var(--ink-4)" }} />
          {lang === "vi" ? "EN" : "VI"}
        </button>
        <button
          onClick={onHome}
          style={{
            width: 44, height: 44, borderRadius: 10,
            background: "var(--ink-8)", border: "1.5px solid var(--ink-7)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--ink-3)", cursor: "pointer",
          }}
          title="Trang chủ"
        >
          <Icon name="home" size={20} />
        </button>
        <button
          onClick={onHelp}
          style={{
            width: 44, height: 44, borderRadius: 10,
            background: "var(--orange-lt)", border: "1.5px solid #FDE68A",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--orange-dk)", cursor: "pointer",
          }}
          title="Hỗ trợ"
        >
          <Icon name="help" size={20} />
        </button>
      </div>
    </div>
  );
}

/* ── PageHeader — back button + title ──────────────────── */
interface PageHeaderProps {
  title: string;
  sub?: string;
  onBack: () => void;
  step?: number;
  totalSteps?: number;
  right?: React.ReactNode;
}

export function PageHeader({ title, sub, onBack, step, totalSteps, right }: PageHeaderProps) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 20,
      padding: "24px 40px", flexShrink: 0,
    }}>
      <button
        onClick={onBack}
        className="btn btn-ghost btn-sm"
        style={{ gap: 6, borderRadius: 10, padding: "0 16px" }}
      >
        <Icon name="back" size={18} />
        Quay lại
      </button>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: "var(--ink-0)", letterSpacing: "-.01em" }}>{title}</div>
        {sub && <div style={{ fontSize: 15, color: "var(--ink-4)", marginTop: 3 }}>{sub}</div>}
      </div>
      {step != null && totalSteps != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} style={{
              height: 6, borderRadius: 999,
              width: i === step ? 32 : 20,
              background: i <= step ? "var(--blue)" : "var(--ink-6)",
              transition: "all .3s ease",
            }} />
          ))}
          <span style={{ fontSize: 13, color: "var(--ink-4)", marginLeft: 4, fontWeight: 600 }}>
            {step + 1}/{totalSteps}
          </span>
        </div>
      )}
      {right}
    </div>
  );
}

/* ── StatusTag ─────────────────────────────────────────── */
const TAG_MAP: Record<string, { label: string; cls: string }> = {
  verified:  { label: "Đã xác thực",  cls: "tag-verified"  },
  available: { label: "Khả dụng",     cls: "tag-available" },
  missing:   { label: "Còn thiếu",    cls: "tag-missing"   },
  done:      { label: "Hoàn tất",     cls: "tag-done"      },
  pending:   { label: "Đang xử lý",   cls: "tag-pending"   },
  received:  { label: "Đã nhận",      cls: "tag-received"  },
};

export function StatusTag({ status }: { status: string }) {
  const t = TAG_MAP[status] ?? { label: status, cls: "tag-available" };
  return <span className={`tag ${t.cls}`}>{t.label}</span>;
}

/* ── InfoRow ────────────────────────────────────────────── */
export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      display: "flex", gap: 16,
      padding: "14px 0", borderBottom: "1px solid var(--ink-7)",
    }}>
      <div style={{ width: 180, fontSize: 14, color: "var(--ink-4)", fontWeight: 500, flexShrink: 0 }}>{label}</div>
      <div style={{ fontSize: 16, color: "var(--ink-1)", fontWeight: 600 }}>{value}</div>
    </div>
  );
}

/* ── Spinner ────────────────────────────────────────────── */
export function Spinner({ size = 36, color = "var(--blue)" }: { size?: number; color?: string }) {
  return (
    <div style={{ width: size, height: size, display: "grid", placeItems: "center", flexShrink: 0 }}>
      <svg viewBox="0 0 24 24" width={size} height={size} style={{ animation: "spin 1s linear infinite", color }}>
        <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0" opacity="0.25"/>
        <path fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" d="M21 12a9 9 0 00-9-9"/>
      </svg>
    </div>
  );
}
