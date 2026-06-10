"use client";
import React from "react";
import { TopBar, PageHeader, InfoRow } from "../ui";
import { Icon } from "../icons";
import { PROFILE } from "../data";

interface Props {
  lang: "vi" | "en";
  onLangChange: (l: "vi" | "en") => void;
  onBack: () => void;
  onHome: () => void;
  onHelp: () => void;
  onContinue: () => void;
}

export function ProfileScreen({ lang, onLangChange, onBack, onHome, onHelp, onContinue }: Props) {
  return (
    <div style={{ width: 1920, height: 1080, display: "flex", flexDirection: "column", background: "var(--ink-8)" }}>
      <TopBar lang={lang} onLangChange={onLangChange} onHome={onHome} onHelp={onHelp}
        title="Thông tin công dân" />
      <PageHeader title="" onBack={onBack} step={1} totalSteps={5} />

      <div style={{ flex: 1, display: "flex", gap: 32, padding: "0 48px 40px", minHeight: 0 }}>
        {/* Left: Avatar card */}
        <div className="card" style={{ width: 380, display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 32px", gap: 0, flexShrink: 0 }}>
          <div style={{
            width: 140, height: 140, borderRadius: "50%",
            background: "var(--blue-lt)", border: "4px solid var(--blue-mid)",
            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24,
          }}>
            <Icon name="user" size={72} style={{ color: "var(--blue)" }} />
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "var(--ink-0)", textAlign: "center", marginBottom: 6 }}>
            {PROFILE.name}
          </div>
          <div style={{ fontSize: 14, color: "var(--ink-4)", marginBottom: 32 }}>
            Mã số: {PROFILE.id}
          </div>
          {/* Stats */}
          <div style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { n: PROFILE.docCount,    l: "Giấy tờ", color: "var(--blue)"   },
              { n: PROFILE.activeApps,  l: "Hồ sơ",   color: "var(--orange)" },
            ].map(s => (
              <div key={s.l} style={{
                background: "var(--ink-8)", borderRadius: 14, padding: "16px 12px", textAlign: "center",
                border: "1px solid var(--ink-7)",
              }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: s.color }}>{s.n}</div>
                <div style={{ fontSize: 13, color: "var(--ink-4)", marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
          {/* Status */}
          <div style={{
            marginTop: 24, padding: "10px 20px", borderRadius: 999,
            background: "var(--green-lt)", color: "var(--green)",
            fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)", display: "block" }} />
            Đã xác thực · Tài khoản mức 2
          </div>
        </div>

        {/* Right: Detail card */}
        <div className="card" style={{ flex: 1, padding: "32px 40px", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--ink-0)", marginBottom: 8 }}>
            Thông tin cá nhân
          </div>
          <div style={{ fontSize: 14, color: "var(--ink-4)", marginBottom: 24 }}>
            Thông tin được lấy từ Cơ sở dữ liệu dân cư quốc gia
          </div>
          <div style={{ flex: 1 }}>
            <InfoRow label="Họ và tên"         value={PROFILE.name} />
            <InfoRow label="Ngày sinh"          value={PROFILE.dob} />
            <InfoRow label="Giới tính"          value={PROFILE.gender} />
            <InfoRow label="Số CCCD / CMT"      value={PROFILE.id} />
            <InfoRow label="Địa chỉ thường trú" value={PROFILE.address} />
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 16, justifyContent: "flex-end", paddingTop: 24, borderTop: "1.5px solid var(--ink-7)" }}>
            <button className="btn btn-ghost btn-lg" onClick={onBack} style={{ minWidth: 220 }}>
              <Icon name="x" size={18} />
              Không phải tôi
            </button>
            <button className="btn btn-primary btn-lg" onClick={onContinue} style={{ minWidth: 280 }}>
              Tiếp tục
              <Icon name="arrow" size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
