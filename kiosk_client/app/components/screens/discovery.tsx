"use client";
import React, { useState } from "react";
import { TopBar, PageHeader } from "../ui";
import { Icon } from "../icons";
import { CATEGORIES, AI_SUGGESTIONS } from "../data";

interface Props {
  lang: "vi" | "en";
  onLangChange: (l: "vi" | "en") => void;
  onBack: () => void;
  onHome: () => void;
  onHelp: () => void;
  onSelectService: (id: string) => void;
  onAI: () => void;
}

export function DiscoveryScreen({ lang, onLangChange, onBack, onHome, onHelp, onSelectService, onAI }: Props) {
  const [search, setSearch] = useState("");
  const [hov, setHov] = useState<string | null>(null);

  return (
    <div style={{ width: 1920, height: 1080, display: "flex", flexDirection: "column", background: "var(--ink-8)" }}>
      <TopBar lang={lang} onLangChange={onLangChange} onHome={onHome} onHelp={onHelp}
        title="Chọn thủ tục" subtitle="Tìm kiếm hoặc chọn nhóm dịch vụ" />
      <PageHeader title="" onBack={onBack} step={2} totalSteps={5} />

      <div style={{ flex: 1, display: "flex", gap: 28, padding: "0 48px 40px", minHeight: 0 }}>
        {/* Left panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Search */}
          <div style={{
            display: "flex", alignItems: "center", gap: 16,
            background: "#fff", borderRadius: 16, border: "1.5px solid var(--ink-7)",
            padding: "0 24px", height: 68, boxShadow: "var(--shadow-sm)",
          }}>
            <Icon name="search" size={24} style={{ color: "var(--ink-4)", flexShrink: 0 }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Nhập tên thủ tục hoặc từ khóa..."
              style={{
                flex: 1, border: "none", outline: "none", fontSize: 18, color: "var(--ink-1)",
                background: "transparent", fontFamily: "inherit",
              }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ color: "var(--ink-4)", cursor: "pointer" }}>
                <Icon name="x" size={20} />
              </button>
            )}
          </div>

          {/* Category grid */}
          <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "repeat(2, 1fr)", gap: 16 }}>
            {CATEGORIES.map(cat => {
              const isHov = hov === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => onSelectService(cat.id)}
                  onPointerEnter={() => setHov(cat.id)}
                  onPointerLeave={() => setHov(null)}
                  style={{
                    display: "flex", flexDirection: "column", alignItems: "flex-start",
                    padding: "28px 32px", borderRadius: 20,
                    background: "#fff", border: `2px solid ${isHov ? "var(--blue)" : "var(--ink-7)"}`,
                    cursor: "pointer", textAlign: "left",
                    boxShadow: isHov ? "0 8px 24px rgba(0,0,0,.1)" : "var(--shadow-sm)",
                    transform: isHov ? "translateY(-2px)" : "none",
                    transition: "all .2s cubic-bezier(0.34,1.56,0.64,1)",
                  }}
                >
                  <div style={{
                    width: 56, height: 56, borderRadius: 14, marginBottom: 16,
                    background: isHov ? "var(--blue-lt)" : "var(--ink-8)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon name={cat.icon} size={28} style={{ color: isHov ? "var(--blue)" : "var(--ink-3)" }} />
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: isHov ? "var(--blue)" : "var(--ink-0)", marginBottom: 4 }}>{cat.label}</div>
                  <div style={{ fontSize: 14, color: "var(--ink-4)" }}>{cat.sub}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: AI panel */}
        <div style={{ width: 420, display: "flex", flexDirection: "column", gap: 16, flexShrink: 0 }}>
          <div className="card" style={{ flex: 1, padding: "28px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--purple-lt)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="ai" size={24} style={{ color: "var(--purple)" }} />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "var(--ink-0)" }}>Gợi ý thông minh</div>
                <div style={{ fontSize: 13, color: "var(--ink-4)" }}>Dựa trên lịch sử giao dịch</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {AI_SUGGESTIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => onSelectService(s.id)}
                  style={{
                    display: "flex", alignItems: "center", gap: 14,
                    padding: "16px 18px", borderRadius: 14,
                    background: "var(--ink-8)", border: "1.5px solid var(--ink-7)",
                    cursor: "pointer", textAlign: "left",
                    transition: "all .2s",
                  }}
                  onPointerEnter={e => { e.currentTarget.style.borderColor = "var(--purple)"; e.currentTarget.style.background = "var(--purple-lt)"; }}
                  onPointerLeave={e => { e.currentTarget.style.borderColor = "var(--ink-7)"; e.currentTarget.style.background = "var(--ink-8)"; }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon name="doc" size={20} style={{ color: "var(--purple)" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink-0)", marginBottom: 2 }}>{s.title}</div>
                    <div style={{ fontSize: 13, color: "var(--ink-4)" }}>{s.sub}</div>
                  </div>
                  <Icon name="arrow" size={16} style={{ color: "var(--ink-5)", flexShrink: 0 }} />
                </button>
              ))}
            </div>

            <button className="btn btn-soft btn-md" onClick={onAI} style={{ marginTop: "auto", gap: 10 }}>
              <Icon name="mic" size={18} style={{ color: "var(--blue)" }} />
              Hỏi Trợ lý ảo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
