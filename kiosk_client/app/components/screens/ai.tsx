"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { TopBar, PageHeader } from "../ui";
import { AssistantAvatar } from "../illustrations";
import { Icon } from "../icons";
import { aiApi, AiProcedureCard, AiChatAction } from "../../lib/api";

interface Props {
  lang: "vi" | "en";
  onLangChange: (l: "vi" | "en") => void;
  onBack: () => void;
  onHome: () => void;
  onHelp: () => void;
  sessionId?: string;
  locationId?: string;
  deviceId?: string;
  /** Start the configured online submission workflow for a procedure. */
  onStartProcedure?: (procedureId: string, online: boolean, name: string) => void;
  /** Jump to the copy-document (sao y) flow. */
  onStartCopyDoc?: () => void;
}

type Msg = { from: "ai" | "user"; text: string; procedures?: AiProcedureCard[]; actions?: AiChatAction[] };

const FALLBACK_CHIPS = [
  "Thủ tục đăng ký khai sinh?",
  "Cách nộp hồ sơ cấp CCCD?",
  "Thời gian xử lý hồ sơ?",
  "Quầy giải quyết hộ tịch?",
];

const DEFAULT_WELCOME = "Xin chào! Tôi là Trợ lý Dịch vụ Công. Tôi có thể giúp bạn tra cứu thủ tục, hướng dẫn nộp hồ sơ và giải đáp mọi thắc mắc. Bạn cần hỗ trợ gì?";

export function AIScreen({ lang, onLangChange, onBack, onHome, onHelp, sessionId, locationId, deviceId, onStartProcedure, onStartCopyDoc }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([{ from: "ai", text: DEFAULT_WELCOME }]);
  const [chips, setChips] = useState<string[]>(FALLBACK_CHIPS);
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [typing, setTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, typing]);

  // Pull the CMS-configured welcome message + suggested questions for this location.
  useEffect(() => {
    let alive = true;
    aiApi.getConfig(locationId).then(cfg => {
      if (!alive) return;
      if (cfg.welcomeMessage) setMsgs([{ from: "ai", text: cfg.welcomeMessage }]);
      if (cfg.suggestedQuestions?.length) setChips(cfg.suggestedQuestions);
    }).catch(() => { /* keep defaults if the API is unreachable */ });
    return () => { alive = false; };
  }, [locationId]);

  const sendMsg = useCallback(async (text: string) => {
    if (!text.trim() || typing) return;
    setMsgs(p => [...p, { from: "user", text }]);
    setInput("");
    setTyping(true);
    try {
      const res = await aiApi.chat({
        kioskSessionId: sessionId ?? `ai-${deviceId ?? "kiosk"}`,
        message: text,
        language: lang,
        locationId,
      });
      setMsgs(p => [...p, { from: "ai", text: res.message, procedures: res.procedures, actions: res.actions }]);
    } catch {
      setMsgs(p => [...p, { from: "ai", text: "Xin lỗi, tôi chưa kết nối được với hệ thống. Quý khách vui lòng thử lại hoặc nhờ cán bộ tại quầy hỗ trợ." }]);
    } finally {
      setTyping(false);
    }
  }, [typing, sessionId, deviceId, locationId, lang]);

  // Dispatch an action chip returned by the assistant.
  const runAction = useCallback((a: AiChatAction, card?: AiProcedureCard) => {
    switch (a.type) {
      case "START_WORKFLOW":
      case "OPEN_PROCEDURE":
      case "VIEW_REQUIREMENTS": {
        const id = a.procedure_id ?? card?.procedure_id;
        const c = card ?? undefined;
        if (id && onStartProcedure) onStartProcedure(id, c?.online ?? true, c?.name ?? "");
        break;
      }
      case "START_COPYDOC":
        onStartCopyDoc?.();
        break;
      case "SEARCH_PROCEDURE":
        void sendMsg("Tôi muốn tra cứu thủ tục hành chính");
        break;
      case "HUMAN_HELP":
        onHelp();
        break;
    }
  }, [onStartProcedure, onStartCopyDoc, onHelp, sendMsg]);

  // Native Vosk STT (Tauri) — the Web Speech API doesn't run in WebView2. In a
  // plain browser (dev) we fall back to webkitSpeechRecognition. Vietnamese is the
  // default in both paths. A single in-flight session prevents overlapping audio.
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  const unlistenRef = useRef<Array<() => void>>([]);
  const clearListeners = useCallback(() => { unlistenRef.current.forEach(u => u()); unlistenRef.current = []; }, []);

  const stopVoice = useCallback(async () => {
    setListening(false);
    if (isTauri) {
      try { const { invoke } = await import("@tauri-apps/api/core"); await invoke("voice_stop"); } catch { /* ignore */ }
      clearListeners();
    } else {
      recognitionRef.current?.stop();
    }
  }, [isTauri, clearListeners]);

  const startVoice = useCallback(async () => {
    setInput("");
    setListening(true);
    if (isTauri) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const { listen } = await import("@tauri-apps/api/event");
        const unPartial = await listen<string>("voice:partial", e => setInput(e.payload));
        const unFinal = await listen<string>("voice:final", e => { clearListeners(); setListening(false); void sendMsg(e.payload); });
        const unEnded = await listen("voice:ended", () => { clearListeners(); setListening(false); });
        const unErr = await listen<string>("voice:error", e => {
          clearListeners(); setListening(false);
          setMsgs(p => [...p, { from: "ai", text: e.payload || "Chưa nhận dạng được giọng nói. Quý khách vui lòng gõ câu hỏi nhé." }]);
        });
        unlistenRef.current = [unPartial, unFinal, unEnded, unErr];
        await invoke("voice_start"); // throws if the `voice` feature isn't built
      } catch (err) {
        clearListeners(); setListening(false);
        setMsgs(p => [...p, { from: "ai", text: typeof err === "string" ? err : "Thiết bị chưa hỗ trợ nhập bằng giọng nói. Quý khách vui lòng gõ câu hỏi nhé." }]);
      }
      return;
    }
    // Browser dev fallback
    const w = window as unknown as { SpeechRecognition?: any; webkitSpeechRecognition?: any };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) {
      setListening(false);
      setMsgs(p => [...p, { from: "ai", text: "Thiết bị chưa hỗ trợ nhập bằng giọng nói. Quý khách vui lòng gõ câu hỏi nhé." }]);
      return;
    }
    const rec = new SR();
    rec.lang = "vi-VN";
    rec.interimResults = true;
    rec.continuous = false;
    recognitionRef.current = rec;
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join("");
      setInput(transcript);
      if (e.results[e.results.length - 1].isFinal) { setListening(false); void sendMsg(transcript); }
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  }, [isTauri, clearListeners, sendMsg]);

  // Single toggle; ignores re-entry while a session is starting/stopping.
  const togglingRef = useRef(false);
  const toggleMic = useCallback(async () => {
    if (togglingRef.current) return;
    togglingRef.current = true;
    try {
      if (listening) await stopVoice();
      else await startVoice();
    } finally {
      togglingRef.current = false;
    }
  }, [listening, startVoice, stopVoice]);

  useEffect(() => () => { void stopVoice(); }, [stopVoice]);

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
              <div key={i} style={{ display: "flex", gap: 12, alignSelf: m.from === "ai" ? "flex-start" : "flex-end", maxWidth: m.from === "ai" ? "82%" : "70%" }}>
                {m.from === "ai" && <AssistantAvatar size={36} />}
                <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
                  <div style={{
                    padding: "14px 18px", borderRadius: m.from === "ai" ? "4px 18px 18px 18px" : "18px 4px 18px 18px",
                    background: m.from === "ai" ? "#fff" : "var(--purple)",
                    color: m.from === "ai" ? "var(--ink-1)" : "#fff",
                    fontSize: 16, lineHeight: 1.6,
                    boxShadow: "var(--shadow-sm)",
                    border: m.from === "ai" ? "1px solid var(--ink-7)" : "none",
                    alignSelf: m.from === "ai" ? "flex-start" : "flex-end",
                    whiteSpace: "pre-wrap",
                  }}>
                    {m.text}
                  </div>

                  {/* Procedure recommendation cards (from CMS data) */}
                  {m.procedures?.map(p => (
                    <ProcedureRecCard key={p.procedure_id} card={p} onStart={() => onStartProcedure?.(p.procedure_id, p.online, p.name)} />
                  ))}

                  {/* Action chips */}
                  {m.actions && m.actions.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {m.actions.map((a, ai) => {
                        const card = m.procedures?.find(p => p.procedure_id === a.procedure_id) ?? m.procedures?.[0];
                        const primary = a.type === "START_WORKFLOW" || a.type === "OPEN_PROCEDURE" || a.type === "START_COPYDOC";
                        return (
                          <button key={ai} onClick={() => runAction(a, card)}
                            style={{
                              padding: "10px 16px", borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: "pointer",
                              border: primary ? "none" : "1.5px solid var(--ink-7)",
                              background: primary ? "var(--purple)" : "#fff",
                              color: primary ? "#fff" : "var(--ink-2)",
                            }}>
                            {a.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
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
              onClick={() => void toggleMic()}
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
          {chips.map(c => (
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

/* ── Procedure recommendation card (structured CMS data) ─────── */
function ProcedureRecCard({ card, onStart }: { card: AiProcedureCard; onStart: () => void }) {
  return (
    <div style={{
      background: "#fff", border: "1.5px solid var(--ink-7)", borderRadius: 16,
      padding: "16px 18px", boxShadow: "var(--shadow-sm)", maxWidth: 560,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "var(--ink-0)", lineHeight: 1.4 }}>{card.name}</div>
        <span style={{
          flexShrink: 0, fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
          background: card.online ? "var(--green-lt, #dcfce7)" : "var(--ink-8)",
          color: card.online ? "var(--green, #15803d)" : "var(--ink-4)",
        }}>{card.online ? "Nộp trực tuyến" : "Tại quầy"}</span>
      </div>
      {card.description && <div style={{ marginTop: 6, fontSize: 14, color: "var(--ink-4)", lineHeight: 1.5 }}>{card.description}</div>}

      <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: "8px 20px", fontSize: 13.5, color: "var(--ink-3)" }}>
        <span>🕒 {card.processingTime}</span>
        <span>💰 {card.fee}</span>
        {card.agency && <span>🏛️ {card.agency}</span>}
      </div>

      {card.documents.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink-2)", marginBottom: 6 }}>Giấy tờ cần chuẩn bị</div>
          <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 4 }}>
            {card.documents.slice(0, 6).map((d, i) => (
              <li key={i} style={{ fontSize: 13.5, color: "var(--ink-3)", lineHeight: 1.5 }}>
                {d.name}{!d.required && <span style={{ color: "var(--ink-5)" }}> (không bắt buộc)</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {card.online && (
        <button onClick={onStart}
          className="btn btn-primary"
          style={{ marginTop: 14, width: "100%", padding: "12px 0", borderRadius: 12, fontSize: 15, fontWeight: 800 }}>
          Nộp hồ sơ ngay
        </button>
      )}
    </div>
  );
}
