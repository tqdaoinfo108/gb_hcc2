"use client";
import React, { useState, useEffect } from "react";
import { SuccessMark } from "../illustrations";
import { Icon } from "../icons";

interface Props {
  onHome: () => void;
}

export function SuccessScreen({ onHome }: Props) {
  const [countdown, setCountdown] = useState(45);
  const [printed, setPrinted] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown(p => {
        if (p <= 1) { onHome(); return 0; }
        return p - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [onHome]);

  const dashOffset = 2 * Math.PI * 44 * (1 - countdown / 45);

  return (
    <div style={{
      width: 1920, height: 1080, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 0,
      background: "#fff",
      animation: "fadeIn .5s ease both",
    }}>
      {/* Top accent */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 6, background: "linear-gradient(90deg,#16A34A,#22c55e,#16A34A)" }} />

      {/* Success mark */}
      <div style={{ marginBottom: 32, animation: "pop .5s cubic-bezier(0.34,1.56,0.64,1) both" }}>
        <SuccessMark size={160} />
      </div>

      <div style={{ fontSize: 56, fontWeight: 800, color: "var(--green)", letterSpacing: "-.02em", marginBottom: 12 }}>
        Nộp hồ sơ thành công!
      </div>
      <div style={{ fontSize: 22, color: "var(--ink-3)", marginBottom: 48 }}>
        Hồ sơ của bạn đã được tiếp nhận và đang được xử lý
      </div>

      {/* Code card */}
      <div style={{
        background: "var(--ink-8)", border: "1.5px solid var(--ink-7)",
        borderRadius: 20, padding: "28px 48px", textAlign: "center", marginBottom: 48,
        boxShadow: "var(--shadow-md)",
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-4)", marginBottom: 8 }}>
          Mã biên nhận
        </div>
        <div style={{ fontSize: 48, fontWeight: 800, color: "var(--blue)", letterSpacing: ".04em", fontVariantNumeric: "tabular-nums" }}>
          BN-2026-04821
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 32, justifyContent: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--ink-4)" }}>Ngày nhận</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink-1)" }}>10/06/2026</div>
          </div>
          <div style={{ width: 1, background: "var(--ink-6)" }} />
          <div>
            <div style={{ fontSize: 12, color: "var(--ink-4)" }}>Ngày trả kết quả</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink-1)" }}>16/06/2026</div>
          </div>
          <div style={{ width: 1, background: "var(--ink-6)" }} />
          <div>
            <div style={{ fontSize: 12, color: "var(--ink-4)" }}>Địa điểm nhận</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink-1)" }}>Quầy số 03</div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
        <button
          className="btn btn-ghost btn-lg"
          onClick={() => setPrinted(true)}
          style={{ minWidth: 260, gap: 12, position: "relative" }}
        >
          <Icon name="print" size={20} />
          {printed ? "Đã in phiếu" : "In phiếu hẹn"}
          {printed && <span style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "var(--green)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Icon name="check" size={12} style={{ color: "#fff" }} />
          </span>}
        </button>
        <button className="btn btn-primary btn-lg" onClick={onHome} style={{ minWidth: 260, gap: 12 }}>
          <Icon name="home" size={20} />
          Về trang chủ
        </button>
      </div>

      {/* Countdown */}
      <div style={{ marginTop: 36, display: "flex", alignItems: "center", gap: 12, color: "var(--ink-4)", fontSize: 15 }}>
        <svg width={32} height={32} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--ink-7)" strokeWidth="8"/>
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--blue)" strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 44}`}
            strokeDashoffset={dashOffset}
            style={{ transform: "rotate(-90deg)", transformOrigin: "center", transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
        Tự động quay về trang chủ sau <strong style={{ color: "var(--ink-1)" }}>{countdown} giây</strong>
      </div>
    </div>
  );
}
