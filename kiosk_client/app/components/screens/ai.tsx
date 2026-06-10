"use client";
import React, { useState, useRef, useEffect } from "react";
import { TopBar, PageHeader } from "../ui";
import { AssistantAvatar } from "../illustrations";
import { Icon } from "../icons";

interface Props {
  lang: "vi" | "en";
  onLangChange: (l: "vi" | "en") => void;
  onBack: () => void;
  onHome: () => void;
  onHelp: () => void;
}

type Msg = { from: "ai" | "user"; text: string };

const CHIPS = [
  "Thủ tục đăng ký khai sinh?",
  "Cách nộp hồ sơ cấp CCCD?",
  "Thời gian xử lý hồ sơ?",
  "Quầy giải quyết hộ tịch?",
];

const QA: Record<string, string> = {
  "Thủ tục đăng ký khai sinh?": "Để đăng ký khai sinh, bạn cần mang theo CCCD của cha mẹ, giấy chứng sinh của bệnh viện. Thủ tục miễn phí, thời gian 3 ngày làm việc.",
  "Cách nộp hồ sơ cấp CCCD?": "Để cấp CCCD, bạn chọn 'Nộp hồ sơ' trên màn hình chính, xác thực bằng VNeID, điền thông tin và nộp hồ sơ. Thời gian xử lý 7 ngày.",
  "Thời gian xử lý hồ sơ?": "Thời gian xử lý tùy theo loại hồ sơ: hộ tịch 3 ngày, CCCD 7 ngày, chứng thực 1 ngày. Tra cứu tiến độ qua mã biên nhận.",
  "Quầy giải quyết hộ tịch?": "Hồ sơ hộ tịch được giải quyết tại Quầy số 01 và 02, thứ Hai đến Thứ Sáu, 7:30-17:00. Thứ Bảy 7:30-11:30.",
};

const INIT: Msg[] = [
  { from: "ai", text: "Xin chào! Tôi là Trợ lý Dịch vụ Công. Tôi có thể giúp bạn tra cứu thủ tục, hướng dẫn nộp hồ sơ và giải đáp mọi thắc mắc. Bạn cần hỗ trợ gì?" },
];

export function AIScreen({ lang, onLangChange, onBack, onHome, onHelp }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>(INIT);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, typing]);

  function sendMsg(text: string) {
    if (!text.trim()) return;
    setMsgs(p => [...p, { from: "user", text }]);
    setInput("");
    setTyping(true);
    setTimeout(() => {
      const reply = QA[text] ?? "Cảm ơn câu hỏi của bạn. Để được hỗ trợ chi tiết hơn, vui lòng liên hệ nhân viên tại quầy hoặc gọi hotline 1900 6017.";
      setTyping(false);
      setMsgs(p => [...p, { from: "ai", text: reply }]);
    }, 1200);
  }

  function toggleMic() {
    setListening(p => !p);
    if (listening) {
      setListening(false);
      sendMsg("Thủ tục đăng ký khai sinh?");
    }
  }

  return (
    <div style={{ width: 1920, height: 1080, display: "flex", flexDirection: "column", background: "var(--ink-8)" }}>
      <TopBar lang={lang} onLangChange={onLangChange} onHome={onHome} onHelp={onHelp}
        title="Trợ lý ảo" subtitle="Hỗ trợ 24/7 bằng giọng nói và văn bản" />
      <PageHeader title="" onBack={onBack} />

      <div style={{ flex: 1, display: "flex", gap: 28, padding: "0 48px 36px", minHeight: 0 }}>
        {/* Chat area */}
        <div className="card" style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* AI header */}
          <div style={{
            display: "flex", alignItems: "center", gap: 16,
            padding: "20px 28px", borderBottom: "1.5px solid var(--ink-7)",
            background: "var(--purple-lt)", flexShrink: 0,
          }}>
            <AssistantAvatar size={56} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--ink-0)" }}>Trợ lý Hành chính Công</div>
              <div style={{ fontSize: 14, color: "var(--ink-4)", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--green)", display: "inline-block" }} />
                Đang hoạt động
              </div>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
            {msgs.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: 12, alignSelf: m.from === "ai" ? "flex-start" : "flex-end", maxWidth: "70%" }}>
                {m.from === "ai" && <AssistantAvatar size={36} />}
                <div style={{
                  padding: "14px 18px", borderRadius: m.from === "ai" ? "4px 18px 18px 18px" : "18px 4px 18px 18px",
                  background: m.from === "ai" ? "#fff" : "var(--purple)",
                  color: m.from === "ai" ? "var(--ink-1)" : "#fff",
                  fontSize: 16, lineHeight: 1.6,
                  boxShadow: "var(--shadow-sm)",
                  border: m.from === "ai" ? "1px solid var(--ink-7)" : "none",
                }}>
                  {m.text}
                </div>
              </div>
            ))}
            {typing && (
              <div style={{ display: "flex", gap: 12, alignSelf: "flex-start", maxWidth: "70%" }}>
                <AssistantAvatar size={36} />
                <div style={{ padding: "14px 20px", borderRadius: "4px 18px 18px 18px", background: "#fff", border: "1px solid var(--ink-7)" }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {[0,1,2].map(i => (
                      <span key={i} style={{
                        width: 8, height: 8, borderRadius: "50%", background: "var(--ink-5)",
                        display: "block", animation: `wave 1.2s ease-in-out ${i * 0.2}s infinite`,
                      }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: "16px 24px", borderTop: "1.5px solid var(--ink-7)", display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
            <div style={{
              flex: 1, display: "flex", alignItems: "center",
              background: "var(--ink-8)", borderRadius: 14, border: "1.5px solid var(--ink-7)",
              padding: "0 18px", height: 56,
            }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendMsg(input)}
                placeholder="Nhập câu hỏi..."
                style={{ flex: 1, border: "none", outline: "none", fontSize: 16, background: "transparent", fontFamily: "inherit", color: "var(--ink-1)" }}
              />
            </div>
            <button
              onClick={toggleMic}
              style={{
                width: 56, height: 56, borderRadius: "50%",
                background: listening ? "var(--orange)" : "var(--ink-8)",
                border: `1.5px solid ${listening ? "var(--orange)" : "var(--ink-7)"}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer", flexShrink: 0,
              }}
            >
              {listening ? (
                <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                  {[0,1,2].map(i => (
                    <span key={i} style={{
                      width: 4, borderRadius: 2,
                      background: "#fff",
                      height: `${10 + i * 5}px`,
                      animation: `wave 1s ease-in-out ${i * 0.15}s infinite`,
                    }} />
                  ))}
                </div>
              ) : (
                <Icon name="mic" size={22} style={{ color: "var(--ink-3)" }} />
              )}
            </button>
            <button
              onClick={() => sendMsg(input)}
              disabled={!input.trim()}
              className="btn btn-primary"
              style={{ width: 56, height: 56, borderRadius: "50%", padding: 0, flexShrink: 0 }}
            >
              <Icon name="send" size={20} style={{ color: "#fff" }} />
            </button>
          </div>
        </div>

        {/* Suggestion chips */}
        <div style={{ width: 380, display: "flex", flexDirection: "column", gap: 12, flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink-2)", marginBottom: 4 }}>Câu hỏi thường gặp</div>
          {CHIPS.map(c => (
            <button
              key={c}
              onClick={() => sendMsg(c)}
              style={{
                padding: "18px 20px", borderRadius: 14, textAlign: "left",
                background: "#fff", border: "1.5px solid var(--ink-7)",
                fontSize: 15, fontWeight: 600, color: "var(--ink-2)",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 12,
                transition: "all .2s",
              }}
              onPointerEnter={e => { e.currentTarget.style.borderColor = "var(--purple)"; e.currentTarget.style.color = "var(--purple)"; }}
              onPointerLeave={e => { e.currentTarget.style.borderColor = "var(--ink-7)"; e.currentTarget.style.color = "var(--ink-2)"; }}
            >
              <Icon name="help" size={18} style={{ color: "var(--purple)", flexShrink: 0 }} />
              {c}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
