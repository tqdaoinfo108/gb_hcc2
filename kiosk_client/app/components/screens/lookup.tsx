"use client";
import React, { useState } from "react";
import { TopBar, PageHeader } from "../ui";
import { Icon } from "../icons";
import { LOOKUP_RESULT } from "../data";

interface Props {
  lang: "vi" | "en";
  onLangChange: (l: "vi" | "en") => void;
  onBack: () => void;
  onHome: () => void;
  onHelp: () => void;
}

export function LookupScreen({ lang, onLangChange, onBack, onHome, onHelp }: Props) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<typeof LOOKUP_RESULT | null>(null);
  const [loading, setLoading] = useState(false);

  function search() {
    if (!query.trim()) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setResult(LOOKUP_RESULT);
    }, 1000);
  }

  const stepColors: Record<string, string> = {
    "done":    "var(--green)",
    "active":  "var(--blue)",
    "pending": "var(--ink-6)",
  };

  return (
    <div style={{ width: 1920, height: 1080, display: "flex", flexDirection: "column", background: "var(--ink-8)" }}>
      <TopBar lang={lang} onLangChange={onLangChange} onHome={onHome} onHelp={onHelp}
        title="Tra cứu hồ sơ" subtitle="Kiểm tra tiến độ xử lý hồ sơ của bạn" />
      <PageHeader title="" onBack={onBack} />

      <div style={{ flex: 1, padding: "0 120px 48px", display: "flex", flexDirection: "column", gap: 28, alignItems: "center" }}>
        {/* Search bar */}
        <div style={{
          width: "100%", maxWidth: 900,
          display: "flex", gap: 12, alignItems: "center",
          background: "#fff", borderRadius: 18, border: "1.5px solid var(--ink-7)",
          padding: "12px 12px 12px 24px", boxShadow: "var(--shadow-md)",
        }}>
          <Icon name="search" size={22} style={{ color: "var(--ink-4)", flexShrink: 0 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && search()}
            placeholder="Nhập mã biên nhận (VD: BN-2026-04821)..."
            style={{ flex: 1, border: "none", outline: "none", fontSize: 18, fontFamily: "inherit", color: "var(--ink-1)", background: "transparent" }}
          />
          <button className="btn btn-primary btn-lg" onClick={search} style={{ gap: 10, minWidth: 140, flexShrink: 0 }}>
            <Icon name="search" size={18} />
            {loading ? "Đang tìm…" : "Tra cứu"}
          </button>
        </div>

        {/* Empty hint */}
        {!result && !loading && (
          <div style={{ marginTop: 40, textAlign: "center", color: "var(--ink-5)" }}>
            <Icon name="doc" size={64} style={{ color: "var(--ink-7)", marginBottom: 16 }} />
            <div style={{ fontSize: 18, fontWeight: 600 }}>Nhập mã biên nhận để tra cứu tiến độ</div>
            <div style={{ fontSize: 15, marginTop: 8 }}>Ví dụ: BN-2026-04821</div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div style={{ width: "100%", display: "flex", gap: 28, flex: 1, minHeight: 0, animation: "fadeUp .4s ease both" }}>
            {/* Left info */}
            <div className="card" style={{ flex: 1, padding: "28px 32px", display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--ink-4)", marginBottom: 4 }}>Mã biên nhận</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "var(--blue)", letterSpacing: ".04em" }}>{result.code}</div>
                </div>
                <div style={{
                  padding: "8px 20px", borderRadius: 999, background: "var(--blue-lt)",
                  color: "var(--blue)", fontSize: 15, fontWeight: 700,
                }}>Đang xử lý</div>
              </div>

              <div style={{ height: 1, background: "var(--ink-7)" }} />

              {[
                ["Thủ tục",           result.service],
                ["Người nộp",         result.applicant],
                ["Ngày tiếp nhận",    result.received],
                ["Ngày trả kết quả",  result.expected],
                ["Cơ quan xử lý",     result.office],
              ].map(([l, v]) => (
                <div key={l} style={{ display: "flex", gap: 12, padding: "4px 0", borderBottom: "1px solid var(--ink-7)" }}>
                  <span style={{ width: 180, fontSize: 14, color: "var(--ink-4)", flexShrink: 0 }}>{l}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-1)" }}>{v}</span>
                </div>
              ))}
            </div>

            {/* Right: timeline */}
            <div className="card" style={{ width: 440, padding: "28px 32px", flexShrink: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: "var(--ink-0)", marginBottom: 28 }}>Tiến trình xử lý</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {result.timeline.map((step, i) => {
                  const isLast = i === result.timeline.length - 1;
                  const col = stepColors[step.status];
                  return (
                    <div key={step.label} style={{ display: "flex", gap: 16, position: "relative" }}>
                      {/* Connector */}
                      {!isLast && (
                        <div style={{
                          position: "absolute", left: 19, top: 40, width: 2, bottom: -8,
                          background: step.status === "done" ? "var(--green)" : "var(--ink-7)",
                        }} />
                      )}
                      {/* Dot */}
                      <div style={{
                        width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                        background: step.status === "pending" ? "var(--ink-7)" : col,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        boxShadow: step.status === "active" ? `0 0 0 4px ${col}30` : "none",
                        zIndex: 1,
                      }}>
                        {step.status === "done" && <Icon name="check" size={18} style={{ color: "#fff" }} />}
                        {step.status === "active" && (
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fff", animation: "pulseRing 1.5s ease-in-out infinite" }} />
                        )}
                        {step.status === "pending" && <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fff", opacity: .4 }} />}
                      </div>
                      <div style={{ paddingBottom: isLast ? 0 : 32, paddingTop: 8 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: step.status === "pending" ? "var(--ink-5)" : "var(--ink-0)" }}>{step.label}</div>
                        <div style={{ fontSize: 13, color: step.status === "pending" ? "var(--ink-6)" : "var(--ink-4)", marginTop: 2 }}>{step.date}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
