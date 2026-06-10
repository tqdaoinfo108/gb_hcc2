"use client";
import React from "react";
import { AssistantAvatar } from "../illustrations";
import { Icon } from "../icons";

interface Props {
  onClose: () => void;
  onAI: () => void;
}

export function HelpOverlay({ onClose, onAI }: Props) {
  return (
    <div
      style={{
        position: "absolute", inset: 0, zIndex: 100,
        background: "rgba(0,0,0,.55)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "fadeIn .25s ease both",
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: 640, background: "#fff", borderRadius: 28, padding: "48px 44px",
        boxShadow: "0 32px 80px rgba(0,0,0,.28)",
        animation: "pop .3s cubic-bezier(0.34,1.56,0.64,1) both",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 32,
      }}>
        {/* Title */}
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: "var(--ink-0)", marginBottom: 8 }}>Bạn cần hỗ trợ?</div>
          <div style={{ fontSize: 16, color: "var(--ink-4)" }}>Chọn hình thức hỗ trợ phù hợp</div>
        </div>

        {/* Options */}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Call staff */}
          <button
            style={{
              display: "flex", alignItems: "center", gap: 20,
              padding: "24px 28px", borderRadius: 18,
              background: "var(--blue-lt)", border: "2px solid var(--blue)",
              cursor: "pointer", textAlign: "left",
              transition: "all .2s",
            }}
            onPointerEnter={e => { e.currentTarget.style.background = "var(--blue)"; (e.currentTarget.querySelector("div") as HTMLElement).style.color = "#fff"; }}
            onPointerLeave={e => { e.currentTarget.style.background = "var(--blue-lt)"; (e.currentTarget.querySelector("div") as HTMLElement).style.color = "var(--ink-0)"; }}
          >
            <div style={{ width: 64, height: 64, borderRadius: 16, background: "var(--blue)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <Icon name="user" size={32} style={{ color: "#fff" }} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--ink-0)", marginBottom: 4 }}>Gọi nhân viên</div>
              <div style={{ fontSize: 14, color: "var(--ink-4)" }}>Nhân viên sẽ đến hỗ trợ bạn trực tiếp</div>
            </div>
          </button>

          {/* AI */}
          <button
            onClick={onAI}
            style={{
              display: "flex", alignItems: "center", gap: 20,
              padding: "24px 28px", borderRadius: 18,
              background: "var(--purple-lt)", border: "2px solid var(--purple)",
              cursor: "pointer", textAlign: "left",
            }}
          >
            <div style={{ width: 64, height: 64, borderRadius: 16, overflow: "hidden", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <AssistantAvatar size={64} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "var(--ink-0)", marginBottom: 4 }}>Hỏi Trợ lý ảo</div>
              <div style={{ fontSize: 14, color: "var(--ink-4)" }}>Giải đáp tức thì 24/7 bằng AI</div>
            </div>
          </button>

          {/* Hotline */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center", padding: "12px 0", color: "var(--ink-4)", fontSize: 15 }}>
            <Icon name="help" size={18} style={{ color: "var(--ink-5)" }} />
            Hotline hỗ trợ: <strong style={{ color: "var(--ink-1)" }}>1900 6017</strong>
          </div>
        </div>

        {/* Close */}
        <button onClick={onClose} className="btn btn-ghost btn-md" style={{ width: 200 }}>
          <Icon name="x" size={18} />
          Đóng
        </button>
      </div>
    </div>
  );
}
