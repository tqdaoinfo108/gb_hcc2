"use client";
import React, { useState, useEffect } from "react";
import { TopBar, PageHeader, Spinner } from "../ui";
import { Icon } from "../icons";
import { AUTH_METHODS } from "../data";

interface Props {
  lang: "vi" | "en";
  onLangChange: (l: "vi" | "en") => void;
  onBack: () => void;
  onHome: () => void;
  onHelp: () => void;
  onDone: () => void;
}

export function AuthScreen({ lang, onLangChange, onBack, onHome, onHelp, onDone }: Props) {
  const [loading, setLoading] = useState<string | null>(null);
  const [hov, setHov] = useState<string | null>(null);

  function pick(id: string) {
    if (id === "help") { onHelp(); return; }
    setLoading(id);
  }

  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => onDone(), 1700);
    return () => clearTimeout(t);
  }, [loading, onDone]);

  return (
    <div style={{ width: 1920, height: 1080, display: "flex", flexDirection: "column", background: "var(--ink-8)" }}>
      <TopBar lang={lang} onLangChange={onLangChange} onHome={onHome} onHelp={onHelp}
        title="Xác thực danh tính" subtitle="Chọn phương thức xác thực phù hợp" />

      <PageHeader title="" onBack={onBack} />

      {/* Cards */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 40, padding: "0 80px" }}>
        {AUTH_METHODS.map((m) => {
          const isHov = hov === m.id;
          const isLoading = loading === m.id;
          return (
            <button
              key={m.id}
              onClick={() => pick(m.id)}
              onPointerEnter={() => setHov(m.id)}
              onPointerLeave={() => setHov(null)}
              disabled={!!loading}
              style={{
                flex: 1, maxWidth: 480, height: 360,
                display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20,
                borderRadius: 28, cursor: "pointer",
                background: isLoading ? m.color : "#fff",
                border: `2px solid ${isHov || isLoading ? m.color : "var(--ink-7)"}`,
                boxShadow: isHov || isLoading ? `0 12px 40px rgba(0,0,0,.12), 0 0 0 4px ${m.color}20` : "var(--shadow-md)",
                transform: isHov ? "translateY(-4px)" : "none",
                transition: "all .3s cubic-bezier(0.34,1.56,0.64,1)",
              }}
            >
              {isLoading ? (
                <>
                  <Spinner size={56} color="#fff" />
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>Đang xác thực...</div>
                </>
              ) : (
                <>
                  <div style={{
                    width: 96, height: 96, borderRadius: 24,
                    background: m.bg, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon name={m.icon} size={48} style={{ color: m.color }} />
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: "var(--ink-0)", marginBottom: 8 }}>{m.title}</div>
                    <div style={{ fontSize: 16, color: "var(--ink-4)", lineHeight: 1.5, maxWidth: 320 }}>{m.sub}</div>
                  </div>
                  <div style={{
                    marginTop: 8, padding: "12px 28px", borderRadius: 999,
                    background: m.color, color: "#fff", fontSize: 16, fontWeight: 700,
                  }}>
                    Chọn phương thức này
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ height: 48 }} />
    </div>
  );
}
