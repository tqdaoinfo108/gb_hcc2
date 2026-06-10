"use client";
import React, { useState } from "react";
import { TopBar, PageHeader } from "../ui";
import { Icon } from "../icons";
import { CHECKLIST_DOCS } from "../data";

interface Props {
  lang: "vi" | "en";
  onLangChange: (l: "vi" | "en") => void;
  onBack: () => void;
  onHome: () => void;
  onHelp: () => void;
  onScan: () => void;
  onContinue: () => void;
}

export function ChecklistScreen({ lang, onLangChange, onBack, onHome, onHelp, onScan, onContinue }: Props) {
  const [docs, setDocs] = useState(CHECKLIST_DOCS.map(d => ({ ...d })));
  const doneCount = docs.filter(d => d.done).length;
  const progress = Math.round((doneCount / docs.length) * 100);
  const allDone = doneCount === docs.length;

  function toggleDoc(id: string) {
    setDocs(prev => prev.map(d => d.id === id ? { ...d, done: !d.done } : d));
  }

  return (
    <div style={{ width: 1920, height: 1080, display: "flex", flexDirection: "column", background: "var(--ink-8)" }}>
      <TopBar lang={lang} onLangChange={onLangChange} onHome={onHome} onHelp={onHelp}
        title="Hồ sơ cần chuẩn bị" subtitle="Kiểm tra đầy đủ trước khi nộp" />
      <PageHeader title="" onBack={onBack} step={3} totalSteps={5} />

      <div style={{ flex: 1, display: "flex", gap: 28, padding: "0 48px 40px", minHeight: 0 }}>
        {/* Left: doc list */}
        <div className="card" style={{ flex: 1, padding: "32px 36px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--ink-0)" }}>
              Danh sách hồ sơ
            </div>
            <div style={{
              padding: "6px 16px", borderRadius: 999,
              background: allDone ? "var(--green-lt)" : "var(--orange-lt)",
              color: allDone ? "var(--green)" : "var(--orange-dk)",
              fontSize: 14, fontWeight: 700,
            }}>
              {doneCount}/{docs.length} hoàn tất
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ height: 10, background: "var(--ink-7)", borderRadius: 999, overflow: "hidden", marginBottom: 24 }}>
            <div style={{
              height: "100%", borderRadius: 999,
              width: `${progress}%`,
              background: allDone ? "var(--green)" : "var(--blue)",
              transition: "width .5s ease, background .3s",
            }} />
          </div>

          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
            {docs.map(doc => (
              <button
                key={doc.id}
                onClick={() => toggleDoc(doc.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 16,
                  padding: "18px 20px", borderRadius: 14,
                  background: doc.done ? "var(--green-lt)" : "#fff",
                  border: `1.5px solid ${doc.done ? "var(--green)" : "var(--ink-7)"}`,
                  cursor: "pointer", textAlign: "left",
                  transition: "all .2s",
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: doc.done ? "var(--green)" : "var(--ink-7)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all .2s",
                }}>
                  {doc.done && <Icon name="check" size={16} style={{ color: "#fff" }} />}
                </div>
                <span style={{
                  fontSize: 17, fontWeight: 600,
                  color: doc.done ? "var(--green)" : "var(--ink-1)",
                  textDecoration: doc.done ? "line-through" : "none",
                  textDecorationColor: "var(--green)",
                }}>
                  {doc.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Right: actions */}
        <div style={{ width: 400, display: "flex", flexDirection: "column", gap: 16, flexShrink: 0 }}>
          <div className="card" style={{ padding: "28px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: "var(--ink-0)", marginBottom: 4 }}>Nộp tài liệu</div>
            {[
              { icon: "wallet",  label: "Lấy từ Kho giấy tờ", color: "var(--teal)", bg: "var(--teal-lt)" },
              { icon: "scan",    label: "Quét tài liệu",       color: "var(--blue)", bg: "var(--blue-lt)", action: onScan },
              { icon: "doc",     label: "Tải lên từ điện thoại", color: "var(--purple)", bg: "var(--purple-lt)" },
            ].map(a => (
              <button
                key={a.icon}
                onClick={a.action}
                style={{
                  display: "flex", alignItems: "center", gap: 14,
                  padding: "16px 20px", borderRadius: 14,
                  background: a.bg, border: "none", cursor: "pointer",
                }}
                onPointerEnter={e => { e.currentTarget.style.opacity = "0.85"; }}
                onPointerLeave={e => { e.currentTarget.style.opacity = "1"; }}
              >
                <div style={{ width: 44, height: 44, borderRadius: 10, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon name={a.icon} size={22} style={{ color: a.color }} />
                </div>
                <span style={{ fontSize: 16, fontWeight: 700, color: a.color }}>{a.label}</span>
                <Icon name="arrow" size={16} style={{ color: a.color, marginLeft: "auto" }} />
              </button>
            ))}
          </div>

          <button
            className={`btn btn-lg ${allDone ? "btn-primary" : "btn-ghost"}`}
            onClick={onContinue}
            style={{ width: "100%", gap: 12, fontSize: 20, height: 72 }}
          >
            {allDone ? <Icon name="arrow" size={22} /> : <Icon name="check" size={22} />}
            {allDone ? "Tiếp tục nộp hồ sơ" : "Xem trước khi nộp"}
          </button>
        </div>
      </div>
    </div>
  );
}
