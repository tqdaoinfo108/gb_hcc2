"use client";
import React, { useState, useEffect } from "react";
import { TopBar, PageHeader } from "../ui";
import { Icon } from "../icons";

interface Props {
  lang: "vi" | "en";
  onLangChange: (l: "vi" | "en") => void;
  onBack: () => void;
  onHome: () => void;
  onHelp: () => void;
  onDone: () => void;
}

type Phase = "idle" | "scanning" | "done";

export function ScanScreen({ lang, onLangChange, onBack, onHome, onHelp, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");

  function startScan() {
    setPhase("scanning");
    setTimeout(() => setPhase("done"), 3200);
  }

  return (
    <div style={{ width: 1920, height: 1080, display: "flex", flexDirection: "column", background: "var(--ink-8)" }}>
      <TopBar lang={lang} onLangChange={onLangChange} onHome={onHome} onHelp={onHelp}
        title="Quét tài liệu" subtitle="Đặt tài liệu lên mặt kính phía dưới" />
      <PageHeader title="" onBack={onBack} step={3} totalSteps={5} />

      <div style={{ flex: 1, display: "flex", gap: 40, padding: "0 48px 40px", minHeight: 0 }}>
        {/* Scanner viewport */}
        <div className="card" style={{ flex: 1, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {/* Dim overlay when idle */}
          <div style={{
            position: "absolute", inset: 0,
            background: phase === "idle" ? "rgba(15,23,42,0.6)" : "transparent",
            transition: "background .4s", zIndex: 1,
          }} />

          {/* Corner brackets */}
          {["tl","tr","bl","br"].map(pos => (
            <div key={pos} style={{
              position: "absolute", zIndex: 2,
              width: 40, height: 40,
              top: pos.startsWith("t") ? 32 : undefined,
              bottom: pos.startsWith("b") ? 32 : undefined,
              left: pos.endsWith("l") ? 32 : undefined,
              right: pos.endsWith("r") ? 32 : undefined,
              borderTop: pos.startsWith("t") ? `4px solid ${phase === "done" ? "var(--green)" : "var(--blue)"}` : "none",
              borderBottom: pos.startsWith("b") ? `4px solid ${phase === "done" ? "var(--green)" : "var(--blue)"}` : "none",
              borderLeft: pos.endsWith("l") ? `4px solid ${phase === "done" ? "var(--green)" : "var(--blue)"}` : "none",
              borderRight: pos.endsWith("r") ? `4px solid ${phase === "done" ? "var(--green)" : "var(--blue)"}` : "none",
              transition: "border-color .4s",
            }} />
          ))}

          {/* Scan line */}
          {phase === "scanning" && (
            <div style={{
              position: "absolute", left: 32, right: 32, height: 3,
              background: "linear-gradient(90deg, transparent, var(--blue), transparent)",
              boxShadow: "0 0 12px var(--blue)",
              animation: "scanline 2s ease-in-out infinite", zIndex: 3,
            }} />
          )}

          {/* Document placeholder */}
          <div style={{
            width: 680, height: 480, borderRadius: 8,
            background: phase === "idle" ? "rgba(255,255,255,0.05)" : "#fff",
            border: `2px dashed ${phase === "idle" ? "rgba(255,255,255,0.2)" : "var(--ink-7)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all .4s",
          }}>
            {phase === "idle" && (
              <div style={{ textAlign: "center", color: "rgba(255,255,255,0.6)" }}>
                <Icon name="doc" size={64} style={{ color: "rgba(255,255,255,0.3)", margin: "0 auto 16px" }} />
                <div style={{ fontSize: 20, fontWeight: 600 }}>Đặt tài liệu vào đây</div>
              </div>
            )}
            {phase === "scanning" && (
              <div style={{ width: "100%", height: "100%", background: "linear-gradient(180deg, #f8fafc, #f1f5f9)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="doc" size={80} style={{ color: "var(--ink-5)", opacity: 0.4 }} />
              </div>
            )}
            {phase === "done" && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--green-lt)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name="check" size={40} style={{ color: "var(--green)" }} />
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: "var(--green)" }}>Quét thành công!</div>
              </div>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div style={{ width: 420, display: "flex", flexDirection: "column", gap: 16, flexShrink: 0 }}>
          <div className="card" style={{ padding: "28px 28px 24px" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--ink-0)", marginBottom: 16 }}>Hướng dẫn</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                { n: 1, text: "Đặt tài liệu mặt chữ xuống dưới, canh giữa mặt kính" },
                { n: 2, text: "Đảm bảo tài liệu không bị cong, gấp hoặc che khuất" },
                { n: 3, text: "Nhấn 'Bắt đầu quét' và giữ nguyên tài liệu" },
                { n: 4, text: "Kiểm tra kết quả và quét lại nếu cần" },
              ].map(s => (
                <div key={s.n} style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    background: "var(--blue-lt)", color: "var(--blue)",
                    fontSize: 13, fontWeight: 800,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{s.n}</div>
                  <span style={{ fontSize: 15, color: "var(--ink-2)", lineHeight: 1.5 }}>{s.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: "auto" }}>
            {phase !== "done" ? (
              <button
                className={`btn btn-lg ${phase === "idle" ? "btn-primary" : "btn-ghost"}`}
                onClick={startScan}
                disabled={phase === "scanning"}
                style={{ width: "100%", gap: 12, fontSize: 20, height: 72 }}
              >
                <Icon name="scan" size={22} />
                {phase === "idle" ? "Bắt đầu quét" : "Đang quét..."}
              </button>
            ) : (
              <>
                <button className="btn btn-ghost btn-lg" onClick={() => setPhase("idle")} style={{ width: "100%", gap: 10 }}>
                  <Icon name="scan" size={20} />
                  Quét lại
                </button>
                <button className="btn btn-primary btn-lg" onClick={onDone} style={{ width: "100%", gap: 10, height: 72, fontSize: 20 }}>
                  <Icon name="check" size={22} />
                  Xong, tiếp tục
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
