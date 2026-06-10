"use client";
import React, { useState, useEffect } from "react";
import { Emblem, KioskScene } from "../illustrations";
import { useClock } from "../ui";
import { ANNOUNCEMENTS, TICKER } from "../data";

interface Props {
  onStart: () => void;
  tickerText?: string | null;
}

export function IdleScreen({ onStart, tickerText }: Props) {
  const [ann, setAnn] = useState(0);
  const now = useClock();

  useEffect(() => {
    const id = setInterval(() => setAnn(p => (p + 1) % ANNOUNCEMENTS.length), 4500);
    return () => clearInterval(id);
  }, []);

  const blink = now.getSeconds() % 2 === 0;

  return (
    <div style={{
      width: 1920, height: 1080, display: "flex", flexDirection: "column",
      background: "#EFF6FF",
    }}>
      {/* Top stripe */}
      <div style={{ height: 6, background: "linear-gradient(90deg,#C8102E,#E63950,#C8102E)", flexShrink: 0 }} />

      {/* Brand bar */}
      <div style={{
        display: "flex", alignItems: "center", gap: 20,
        height: 90, padding: "0 48px", flexShrink: 0,
        background: "#fff", borderBottom: "1.5px solid var(--ink-7)",
      }}>
        <Emblem size={60} />
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "#C8102E", marginBottom: 2 }}>
            Cộng hoà xã hội chủ nghĩa Việt Nam · Độc lập - Tự do - Hạnh phúc
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink-0)" }}>
            Trung tâm Phục vụ Hành chính Công · UBND Phường Cửa Nam
          </div>
        </div>
        <div style={{ flex: 1 }} />
        {/* Clock */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 48, fontWeight: 800, color: "var(--ink-0)", fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>
            {now.getHours().toString().padStart(2,"0")}
            <span style={{ opacity: blink ? 1 : 0.2, transition: "opacity .08s" }}>:</span>
            {now.getMinutes().toString().padStart(2,"0")}
          </div>
          <div style={{ fontSize: 13, color: "var(--ink-4)", marginTop: 2 }}>
            {["Chủ nhật","Thứ Hai","Thứ Ba","Thứ Tư","Thứ Năm","Thứ Sáu","Thứ Bảy"][now.getDay()]},
            {" "}{now.getDate().toString().padStart(2,"0")}/{(now.getMonth()+1).toString().padStart(2,"0")}/{now.getFullYear()}
          </div>
        </div>
      </div>

      {/* Main body */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", padding: "0 80px", gap: 80 }}>
        {/* Left content */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--blue)", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "inline-block", width: 32, height: 3, borderRadius: 2, background: "var(--blue)" }} />
            Cổng dịch vụ công quốc gia
          </div>
          <div style={{ fontSize: 72, fontWeight: 800, color: "var(--ink-0)", lineHeight: 1.05, letterSpacing: "-.025em", marginBottom: 20 }}>
            Xin chào,<br/>
            <span style={{ color: "var(--blue)" }}>Quý công dân!</span>
          </div>
          <div style={{ fontSize: 24, color: "var(--ink-3)", fontWeight: 500, marginBottom: 40 }}>
            Chạm vào màn hình để bắt đầu
          </div>

          {/* Announcement */}
          <div style={{
            background: "#fff", borderRadius: 16, border: "1.5px solid var(--ink-7)",
            padding: "20px 24px", marginBottom: 48,
            boxShadow: "var(--shadow-sm)", maxWidth: 680,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--orange)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--orange)", display: "inline-block", animation: "pulseRing 1.5s ease-in-out infinite" }} />
              Thông báo
            </div>
            <div style={{ fontSize: 17, color: "var(--ink-2)", lineHeight: 1.6, fontWeight: 500, minHeight: 56, transition: "opacity .4s" }}>
              {ANNOUNCEMENTS[ann]}
            </div>
            {/* Dots */}
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              {ANNOUNCEMENTS.map((_,i) => (
                <div key={i} style={{
                  height: 6, borderRadius: 999,
                  width: i === ann ? 24 : 6,
                  background: i === ann ? "var(--blue)" : "var(--ink-6)",
                  transition: "all .3s ease",
                }} />
              ))}
            </div>
          </div>

          {/* Start button */}
          <button
            onClick={onStart}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
              height: 124, width: 480, borderRadius: 24,
              background: "var(--blue)", color: "#fff",
              fontSize: 32, fontWeight: 800, border: "none", cursor: "pointer",
              boxShadow: "0 8px 32px rgba(0,104,183,.4)",
              animation: "float 3s ease-in-out infinite",
              letterSpacing: "-.01em",
            }}
          >
            <span style={{
              width: 56, height: 56, borderRadius: "50%",
              background: "rgba(255,255,255,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
              </svg>
            </span>
            BẮT ĐẦU
          </button>
        </div>

        {/* Right illustration */}
        <div style={{ flexShrink: 0, opacity: 0.95 }}>
          <KioskScene width={680} />
        </div>
      </div>

      {/* Ticker */}
      <div style={{
        height: 52, background: "var(--ink-0)", flexShrink: 0,
        display: "flex", alignItems: "center", overflow: "hidden",
      }}>
        <div style={{
          display: "flex", gap: 0, whiteSpace: "nowrap",
          animation: "ticker 30s linear infinite",
        }}>
          {[tickerText?.trim() || TICKER, tickerText?.trim() || TICKER].map((t, i) => (
            <span key={i} style={{ fontSize: 15, color: "rgba(255,255,255,0.7)", fontWeight: 500, paddingRight: 0 }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
