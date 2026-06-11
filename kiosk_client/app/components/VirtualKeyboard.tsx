"use client";
import React, { useState } from "react";
import { Icon } from "./icons";

/**
 * On-screen keyboard for the kiosk. Emits characters and control keys so the
 * caller can forward them to the live remote browser. Includes a Vietnamese
 * accent panel for typing names with diacritics.
 */
interface Props {
  onChar: (text: string) => void;
  onKey: (key: "Backspace" | "Enter" | "Tab") => void;
  onClose: () => void;
}

const ROWS_LETTERS = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

// Vietnamese accented characters (lowercase) — Shift uppercases them.
const ROWS_VI = [
  ["à", "á", "ả", "ã", "ạ", "â", "ấ", "ầ", "ẩ", "ẫ", "ậ"],
  ["ă", "ằ", "ắ", "ẳ", "ẵ", "ặ", "đ", "è", "é", "ẻ", "ẽ", "ẹ"],
  ["ê", "ề", "ế", "ể", "ễ", "ệ", "ì", "í", "ỉ", "ĩ", "ị"],
  ["ò", "ó", "ỏ", "õ", "ọ", "ô", "ồ", "ố", "ổ", "ỗ", "ộ"],
  ["ơ", "ờ", "ớ", "ở", "ỡ", "ợ", "ù", "ú", "ủ", "ũ", "ụ"],
  ["ư", "ừ", "ứ", "ử", "ữ", "ự", "ỳ", "ý", "ỷ", "ỹ", "ỵ"],
];

export function VirtualKeyboard({ onChar, onKey, onClose }: Props) {
  const [shift, setShift] = useState(false);
  const [mode, setMode] = useState<"latin" | "vi">("latin");

  const emit = (ch: string) => {
    onChar(shift ? ch.toUpperCase() : ch);
    if (shift) setShift(false); // single-shot shift
  };

  const Key = ({ label, onClick, flex = 1, accent }: { label: React.ReactNode; onClick: () => void; flex?: number; accent?: boolean }) => (
    <button
      onClick={onClick}
      style={{
        flex, minWidth: 0, height: 64, borderRadius: 12,
        background: accent ? "var(--blue)" : "#fff",
        color: accent ? "#fff" : "var(--ink-1)",
        border: accent ? "none" : "1.5px solid var(--ink-7)",
        fontSize: 22, fontWeight: 700, cursor: "pointer",
        boxShadow: "var(--shadow-sm)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {label}
    </button>
  );

  const rows = mode === "latin" ? ROWS_LETTERS : ROWS_VI;

  return (
    <div style={{
      position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 60,
      background: "var(--ink-9)", borderTop: "2px solid var(--ink-7)",
      padding: "16px 24px 22px", boxShadow: "0 -10px 40px rgba(15,23,42,.18)",
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      {/* Header bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setMode("latin")}
            style={{ padding: "8px 18px", borderRadius: 10, fontSize: 15, fontWeight: 700,
              background: mode === "latin" ? "var(--blue)" : "#fff", color: mode === "latin" ? "#fff" : "var(--ink-3)",
              border: "1.5px solid var(--ink-7)", cursor: "pointer" }}>
            ABC
          </button>
          <button onClick={() => setMode("vi")}
            style={{ padding: "8px 18px", borderRadius: 10, fontSize: 15, fontWeight: 700,
              background: mode === "vi" ? "var(--blue)" : "#fff", color: mode === "vi" ? "#fff" : "var(--ink-3)",
              border: "1.5px solid var(--ink-7)", cursor: "pointer" }}>
            Tiếng Việt
          </button>
        </div>
        <button onClick={onClose}
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 18px", borderRadius: 10, fontSize: 15, fontWeight: 700,
            background: "#fff", color: "var(--ink-3)", border: "1.5px solid var(--ink-7)", cursor: "pointer" }}>
          <Icon name="x" size={16} /> Ẩn bàn phím
        </button>
      </div>

      {/* Character rows */}
      {rows.map((row, ri) => (
        <div key={ri} style={{ display: "flex", gap: 8 }}>
          {ri === rows.length - 1 && mode === "latin" && (
            <Key label={shift ? "⇧" : "⇪"} onClick={() => setShift(s => !s)} flex={1.6} accent={shift} />
          )}
          {row.map(ch => (
            <Key key={ch} label={shift ? ch.toUpperCase() : ch} onClick={() => emit(ch)} />
          ))}
          {ri === rows.length - 1 && (
            <Key label={<Icon name="x" size={20} />} onClick={() => onKey("Backspace")} flex={1.6} />
          )}
        </div>
      ))}

      {/* Bottom control row */}
      <div style={{ display: "flex", gap: 8 }}>
        <Key label={shift ? "⇧ Hoa" : "⇪ Hoa"} onClick={() => setShift(s => !s)} flex={1.4} accent={shift} />
        <Key label="," onClick={() => onChar(",")} />
        <Key label="Dấu cách" onClick={() => onChar(" ")} flex={5} />
        <Key label="." onClick={() => onChar(".")} />
        <Key label="@" onClick={() => onChar("@")} />
        <Key label="Xuống dòng" onClick={() => onKey("Enter")} flex={2} accent />
      </div>
    </div>
  );
}
