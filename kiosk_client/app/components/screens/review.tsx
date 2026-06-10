"use client";
import React from "react";
import { TopBar, PageHeader } from "../ui";
import { Icon } from "../icons";
import { PROFILE, CHECKLIST_DOCS } from "../data";

interface Props {
  lang: "vi" | "en";
  onLangChange: (l: "vi" | "en") => void;
  onBack: () => void;
  onHome: () => void;
  onHelp: () => void;
  onSubmit: () => void;
}

export function ReviewScreen({ lang, onLangChange, onBack, onHome, onHelp, onSubmit }: Props) {
  return (
    <div style={{ width: 1920, height: 1080, display: "flex", flexDirection: "column", background: "var(--ink-8)" }}>
      <TopBar lang={lang} onLangChange={onLangChange} onHome={onHome} onHelp={onHelp}
        title="Kiểm tra hồ sơ" subtitle="Xem lại thông tin trước khi gửi" />
      <PageHeader title="" onBack={onBack} step={4} totalSteps={5} />

      <div style={{ flex: 1, display: "flex", gap: 28, padding: "0 48px 40px", minHeight: 0 }}>
        {/* Left: review content */}
        <div className="card" style={{ flex: 1, padding: "32px 36px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 28 }}>
          {/* Citizen info */}
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <Icon name="user" size={20} style={{ color: "var(--blue)" }} />
              <div style={{ fontSize: 17, fontWeight: 800, color: "var(--ink-0)" }}>Thông tin công dân</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px", background: "var(--ink-8)", borderRadius: 12, padding: "20px 24px" }}>
              {[
                ["Họ và tên", PROFILE.name],
                ["Ngày sinh", PROFILE.dob],
                ["Giới tính", PROFILE.gender],
                ["Số CCCD", PROFILE.id],
              ].map(([l, v]) => (
                <div key={l} style={{ padding: "10px 0", borderBottom: "1px solid var(--ink-7)" }}>
                  <div style={{ fontSize: 12, color: "var(--ink-4)", marginBottom: 3 }}>{l}</div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink-1)" }}>{v}</div>
                </div>
              ))}
              <div style={{ gridColumn: "1/-1", padding: "10px 0" }}>
                <div style={{ fontSize: 12, color: "var(--ink-4)", marginBottom: 3 }}>Địa chỉ thường trú</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink-1)" }}>{PROFILE.address}</div>
              </div>
            </div>
          </section>

          {/* Procedure info */}
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <Icon name="doc" size={20} style={{ color: "var(--blue)" }} />
              <div style={{ fontSize: 17, fontWeight: 800, color: "var(--ink-0)" }}>Thủ tục đăng ký</div>
            </div>
            <div style={{ background: "var(--blue-lt)", borderRadius: 12, padding: "20px 24px", border: "1.5px solid var(--blue-mid)" }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--blue)", marginBottom: 6 }}>
                Cấp lại thẻ căn cước công dân
              </div>
              <div style={{ fontSize: 14, color: "var(--ink-3)" }}>
                Cơ quan giải quyết: Phòng Cảnh sát QLHC về TTXH - Công an thành phố Hà Nội
              </div>
            </div>
          </section>

          {/* Documents */}
          <section>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <Icon name="shield" size={20} style={{ color: "var(--blue)" }} />
              <div style={{ fontSize: 17, fontWeight: 800, color: "var(--ink-0)" }}>Hồ sơ đính kèm</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {CHECKLIST_DOCS.slice(0, 3).map(doc => (
                <div key={doc.id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "14px 18px", borderRadius: 10,
                  background: "var(--green-lt)", border: "1px solid var(--green)",
                }}>
                  <Icon name="check" size={18} style={{ color: "var(--green)" }} />
                  <span style={{ fontSize: 15, fontWeight: 600, color: "var(--green)" }}>{doc.label}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right: submit panel */}
        <div style={{ width: 420, display: "flex", flexDirection: "column", gap: 16, flexShrink: 0 }}>
          <div className="card" style={{ padding: "28px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "var(--ink-0)" }}>Thông tin nộp</div>
            {[
              ["Quầy tiếp nhận",  "Quầy số 03"],
              ["Thời gian dự kiến", "3-5 ngày làm việc"],
              ["Lệ phí",          "Miễn phí"],
              ["Nhận kết quả",    "16/06/2026"],
            ].map(([l, v]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--ink-7)" }}>
                <span style={{ fontSize: 14, color: "var(--ink-4)" }}>{l}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: "var(--ink-1)" }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: "auto" }}>
            <div style={{ fontSize: 13, color: "var(--ink-4)", textAlign: "center", marginBottom: 12, lineHeight: 1.5 }}>
              Bằng cách nhấn "Gửi hồ sơ", bạn xác nhận<br/>mọi thông tin trên là chính xác và đầy đủ.
            </div>
            <button
              className="btn btn-primary"
              onClick={onSubmit}
              style={{ width: "100%", height: 104, fontSize: 32, fontWeight: 800, borderRadius: 20, gap: 16 }}
            >
              <Icon name="send" size={28} />
              Gửi hồ sơ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
