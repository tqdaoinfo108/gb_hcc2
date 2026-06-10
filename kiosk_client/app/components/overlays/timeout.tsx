"use client";
import React, { useState, useEffect } from "react";
import { Icon } from "../icons";

interface Props {
  onContinue: () => void;
  onHome: () => void;
}

const TIMEOUT = 30;

export function TimeoutOverlay({ onContinue, onHome }: Props) {
  const [t, setT] = useState(TIMEOUT);

  useEffect(() => {
    const id = setInterval(() => {
      setT(p => {
        if (p <= 1) { onHome(); return 0; }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [onHome]);

  const pct = t / TIMEOUT;
  const r   = 60;
  const circ = 2 * Math.PI * r;
  const off  = circ * (1 - pct);

  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,.7)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      animation: "fadeIn .3s ease both",
    }}>
      <div style={{
        width: 560, background: "#fff", borderRadius: 28, padding: "52px 44px",
        boxShadow: "0 32px 80px rgba(0,0,0,.35)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 24,
        animation: "pop .35s cubic-bezier(0.34,1.56,0.64,1) both",
        textAlign: "center",
      }}>
        {/* SVG countdown */}
        <div style={{ position: "relative", width: 140, height: 140 }}>
          <svg width={140} height={140} viewBox="0 0 140 140">
            <circle cx="70" cy="70" r={r} fill="none" stroke="var(--ink-7)" strokeWidth="8" />
            <circle cx="70" cy="70" r={r} fill="none" stroke={t <= 10 ? "var(--red)" : "var(--orange)"} strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={off}
              style={{ transform: "rotate(-90deg)", transformOrigin: "center", transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: t <= 10 ? "var(--red)" : "var(--ink-0)", fontVariantNumeric: "tabular-nums" }}>{t}</div>
            <div style={{ fontSize: 12, color: "var(--ink-4)" }}>giây</div>
          </div>
        </div>

        <div style={{ fontSize: 28, fontWeight: 800, color: "var(--ink-0)" }}>Bạn còn ở đây không?</div>
        <div style={{ fontSize: 16, color: "var(--ink-4)", lineHeight: 1.6 }}>
          Phiên làm việc sẽ tự động kết thúc sau <strong style={{ color: "var(--ink-1)" }}>{t} giây</strong>.<br />
          Tất cả thông tin chưa lưu sẽ bị xoá.
        </div>

        <div style={{ display: "flex", gap: 16, width: "100%" }}>
          <button onClick={onHome} className="btn btn-ghost btn-lg" style={{ flex: 1 }}>
            <Icon name="home" size={18} />
            Trang chủ
          </button>
          <button onClick={onContinue} className="btn btn-primary btn-lg" style={{ flex: 1 }}>
            <Icon name="check" size={18} />
            Tiếp tục
          </button>
        </div>
      </div>
    </div>
  );
}
