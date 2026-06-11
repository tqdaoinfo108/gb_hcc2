"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { TopBar, Spinner } from "../ui";
import { Icon } from "../icons";
import { copyDocApi } from "../../lib/api";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/* ═══════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════ */

type Phase =
  | "intro" | "qr_wait" | "uploading" | "processing"
  | "preview" | "qty_fee" | "fee_confirm" | "generating" | "printing" | "success";

type Corner = { x: number; y: number }; // normalised 0–1

interface DetectedDoc {
  id: string;
  label: string;
  labelEn: string;
  icon: string;
  price: number;      // per copy in VND
  color: string;
  bg: string;
  confidence: number; // 0.0 – 1.0
}

/* ═══════════════════════════════════════════════════════
   CONSTANTS
══════════════════════════════════════════════════════ */

/* Default corner positions — perfect rectangle slightly inset */
const DEFAULT_CORNERS: Corner[] = [
  { x: 0.08, y: 0.08 }, { x: 0.92, y: 0.08 },
  { x: 0.92, y: 0.92 }, { x: 0.08, y: 0.92 },
];

/* Simulated AI-detected corners — slightly imperfect, realistic */
const AI_DETECTED_CORNERS: Corner[] = [
  { x: 0.062, y: 0.085 }, { x: 0.907, y: 0.058 },
  { x: 0.934, y: 0.918 }, { x: 0.071, y: 0.943 },
];

/* OCR processing messages */
const PROC_MSGS = [
  "Đang phân tích hình ảnh tài liệu...",
  "Đang nhận diện ký tự và văn bản...",
  "Đang xác định loại giấy tờ...",
  "Đang tính toán góc nghiêng và đường viền...",
  "Hoàn tất — đang chuẩn bị kết quả...",
];

/* Demo detected document types — CMS configures these in production */
const DEMO_DETECTED: DetectedDoc[] = [
  {
    id:"cccd",   label:"Căn cước công dân",      labelEn:"National ID Card",
    icon:"cccd", price:20000, color:"var(--orange)", bg:"var(--orange-lt)", confidence:0.94,
  },
  {
    id:"hotich", label:"Giấy khai sinh",          labelEn:"Birth Certificate",
    icon:"hotich",price:15000,color:"var(--blue)",  bg:"var(--blue-lt)",   confidence:0.88,
  },
  {
    id:"chungthuc",label:"Giấy chứng thực",        labelEn:"Certified Document",
    icon:"chungthuc",price:25000,color:"var(--green)",bg:"var(--green-lt)",confidence:0.79,
  },
];

/* Step strip (no "Chọn loại" — OCR handles that) */
const STEPS: { label: string; phases: Phase[] }[] = [
  { label: "Chụp tài liệu", phases: ["qr_wait","uploading","processing"] },
  { label: "Điều chỉnh",    phases: ["preview"] },
  { label: "Xác nhận phí",  phases: ["qty_fee","fee_confirm"] },
  { label: "Tạo bản sao",   phases: ["generating","printing"] },
  { label: "Hoàn tất",      phases: ["success"] },
];

const PHASE_TITLE: Record<Phase, string> = {
  intro:       "Sao y tài liệu điện tử",
  qr_wait:     "Quét mã để chụp tài liệu",
  uploading:   "Đang nhận tài liệu",
  processing:  "Đang nhận diện tài liệu",
  preview:     "Kiểm tra & điều chỉnh vùng",
  qty_fee:     "Số lượng & Phí dịch vụ",
  fee_confirm: "Xác nhận thanh toán",
  generating:  "Đang tạo bản sao điện tử",
  printing:    "Đang in tài liệu",
  success:     "Sao y hoàn tất",
};

function fmtVND(n: number) { return n.toLocaleString("vi-VN") + " ₫"; }

function mkCode(prefix: string) {
  return prefix + "-2026-" + String(Math.floor(10000 + Math.random() * 90000));
}

function pct(n: number) { return `${Math.round(n * 100)}%`; }

/* ═══════════════════════════════════════════════════════
   STEP STRIP
══════════════════════════════════════════════════════ */
function StepStrip({ phase }: { phase: Phase }) {
  const activeIdx = STEPS.findIndex(s => (s.phases as Phase[]).includes(phase));
  return (
    <div style={{
      display:"flex", alignItems:"center", justifyContent:"center",
      padding:"10px 80px", background:"#fff",
      borderBottom:"1.5px solid var(--ink-7)", flexShrink:0, gap:0,
    }}>
      {STEPS.map((s, i) => {
        const done   = i < activeIdx;
        const active = i === activeIdx;
        return (
          <React.Fragment key={s.label}>
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5, width:160 }}>
              <div style={{
                width:34, height:34, borderRadius:"50%",
                background: done ? "var(--teal)" : active ? "var(--blue)" : "var(--ink-7)",
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"background .3s",
              }}>
                {done
                  ? <svg viewBox="0 0 24 24" width={17} height={17} fill="none" stroke="#fff" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>
                  : <span style={{ fontSize:13, fontWeight:800, color: active?"#fff":"var(--ink-5)" }}>{i+1}</span>
                }
              </div>
              <span style={{
                fontSize:12, fontWeight:600, textAlign:"center",
                color: done?"var(--teal)": active?"var(--blue)":"var(--ink-5)",
                transition:"color .3s",
              }}>{s.label}</span>
            </div>
            {i < STEPS.length-1 && (
              <div style={{
                flex:1, height:2, marginBottom:20,
                background: i < activeIdx ? "var(--teal)" : "var(--ink-7)",
                transition:"background .3s",
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   DECORATIVE QR
══════════════════════════════════════════════════════ */
function FakeQR({ size = 200 }: { size?: number }) {
  const cell = size / 21;
  const pat = [
    [1,1,1,1,1,1,1,0,1,0,1,0,0,0,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,1,0,0,1,0,1,0,0,1,0,0,0,0,0,1],
    [1,0,1,1,1,0,1,0,1,0,1,0,1,0,1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1,0,0,1,0,1,0,0,1,0,1,1,1,0,1],
    [1,0,1,1,1,0,1,0,1,1,0,0,1,0,1,0,1,1,1,0,1],
    [1,0,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,0,1],
    [1,1,1,1,1,1,1,0,1,0,1,0,1,0,1,1,1,1,1,1,1],
    [0,0,0,0,0,0,0,0,1,1,0,1,0,0,0,0,0,0,0,0,0],
    [1,0,1,1,0,1,1,1,0,0,1,0,1,1,0,1,1,0,1,0,1],
    [0,1,0,0,1,0,0,0,1,0,0,1,0,0,1,0,0,1,0,1,0],
    [1,0,1,0,1,1,1,1,0,1,0,0,1,1,0,1,0,0,1,0,1],
    [0,1,0,1,0,0,0,1,1,0,1,0,0,1,1,0,1,1,0,1,0],
    [1,0,0,0,1,0,1,0,0,1,0,1,0,0,1,0,0,0,1,0,1],
    [0,0,0,0,0,0,0,0,1,0,1,1,0,1,0,0,1,0,0,1,0],
    [1,1,1,1,1,1,1,0,0,1,0,0,1,0,1,0,0,1,0,0,1],
    [1,0,0,0,0,0,1,0,1,0,1,0,0,1,0,1,0,0,1,0,0],
    [1,0,1,1,1,0,1,1,0,0,1,1,0,0,1,0,1,0,0,1,0],
    [1,0,1,1,1,0,1,0,1,1,0,0,1,1,0,1,0,1,0,0,1],
    [1,0,1,1,1,0,1,0,0,0,1,0,0,0,1,0,1,0,1,0,0],
    [1,0,0,0,0,0,1,0,1,0,0,1,0,1,0,0,0,1,0,1,0],
    [1,1,1,1,1,1,1,0,0,1,0,0,1,0,1,0,1,0,0,0,1],
  ];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ borderRadius:8, flexShrink:0 }}>
      <rect width={size} height={size} fill="#fff" rx="8"/>
      {pat.flatMap((row,r) => row.map((on,c) => on ? (
        <rect key={`${r}-${c}`} x={c*cell+.5} y={r*cell+.5}
          width={cell-1} height={cell-1} fill="#0F172A" rx={1} />
      ) : null))}
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════
   PHASE — Intro  (no "Chọn loại" step — OCR handles it)
══════════════════════════════════════════════════════ */
function IntroPhase({ onStart, onBack }: { onStart():void; onBack():void }) {
  return (
    <div style={{ height:"100%", display:"flex", alignItems:"center", padding:"0 120px", gap:100 }}>
      {/* Left */}
      <div style={{ flex:1 }}>
        <div style={{
          display:"inline-flex", alignItems:"center", gap:8,
          background:"var(--teal-lt)", borderRadius:999, padding:"6px 18px", marginBottom:28,
        }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background:"var(--teal)" }}/>
          <span style={{ fontSize:14, fontWeight:700, color:"var(--teal-dk)" }}>Dịch vụ số hoá tại chỗ · AI nhận diện tự động</span>
        </div>

        <h1 style={{ fontSize:52, fontWeight:900, color:"var(--ink-0)", lineHeight:1.1, letterSpacing:"-.02em", marginBottom:20 }}>
          Sao y tài liệu<br/>
          <span style={{ color:"var(--blue)" }}>điện tử</span>
        </h1>

        <p style={{ fontSize:18, color:"var(--ink-4)", lineHeight:1.75, maxWidth:520, marginBottom:40 }}>
          Quét mã QR để tải ảnh tài liệu lên — AI tự động nhận diện loại giấy tờ,
          cắt viền và tính phí. In bản sao có giá trị pháp lý ngay tại quầy.
        </p>

        {[
          { icon:"scan",  col:"var(--blue)",   t:"Quét mã QR, tải ảnh hoặc chụp tài liệu"         },
          { icon:"doc",   col:"var(--teal)",   t:"AI tự nhận diện loại giấy tờ — không chọn thủ công" },
          { icon:"scan",  col:"var(--orange)", t:"Tự động phát hiện và cắt đúng viền tài liệu"     },
          { icon:"check", col:"var(--green)",  t:"Bản sao có mã QR xác thực hợp lệ pháp lý"       },
        ].map((f,i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:16, marginBottom:14 }}>
            <div style={{
              width:44, height:44, borderRadius:12, flexShrink:0,
              background: f.col==="var(--blue)"?"var(--blue-lt)":
                f.col==="var(--teal)"?"var(--teal-lt)":
                f.col==="var(--orange)"?"var(--orange-lt)":"var(--green-lt)",
              display:"flex", alignItems:"center", justifyContent:"center",
            }}>
              <Icon name={f.icon as Parameters<typeof Icon>[0]["name"]} size={22} style={{ color:f.col }}/>
            </div>
            <span style={{ fontSize:16, color:"var(--ink-2)", fontWeight:500 }}>{f.t}</span>
          </div>
        ))}

        <div style={{ display:"flex", gap:16, marginTop:44 }}>
          <button className="btn btn-ghost btn-lg" onClick={onBack} style={{ gap:8 }}>
            <Icon name="back" size={20}/> Quay lại
          </button>
          <button className="btn btn-primary btn-xl" onClick={onStart} style={{ gap:12, paddingRight:52 }}>
            Bắt đầu ngay
            <Icon name="arrow" size={22} style={{ color:"#fff" }}/>
          </button>
        </div>
      </div>

      {/* Right — 4-step process */}
      <div style={{ width:460, flexShrink:0, display:"flex", flexDirection:"column", gap:16 }}>
        {[
          { n:"01", t:"Quét mã QR & tải ảnh tài liệu",  icon:"scan",  col:"var(--blue)"   },
          { n:"02", t:"AI nhận diện & cắt viền tự động", icon:"doc",   col:"var(--teal)"   },
          { n:"03", t:"Xác nhận và thanh toán phí",       icon:"check", col:"var(--orange)" },
          { n:"04", t:"In và nhận bản sao điện tử",       icon:"print", col:"var(--green)"  },
        ].map((s,i) => (
          <div key={s.n} style={{
            display:"flex", alignItems:"center", gap:20, padding:"18px 24px",
            background:"#fff", borderRadius:16, border:"1.5px solid var(--ink-7)",
            boxShadow:"var(--shadow-sm)",
            animation:`fadeUp .4s ${i*0.08}s ease both`,
          }}>
            <div style={{
              width:52, height:52, borderRadius:14, flexShrink:0,
              background:s.col==="var(--blue)"?"var(--blue-lt)":
                s.col==="var(--teal)"?"var(--teal-lt)":
                s.col==="var(--orange)"?"var(--orange-lt)":"var(--green-lt)",
              display:"flex", alignItems:"center", justifyContent:"center",
            }}>
              <Icon name={s.icon as Parameters<typeof Icon>[0]["name"]} size={26} style={{ color:s.col }}/>
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:s.col, letterSpacing:".1em" }}>BƯỚC {s.n}</div>
              <div style={{ fontSize:18, fontWeight:700, color:"var(--ink-0)" }}>{s.t}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PHASE — QR Wait
══════════════════════════════════════════════════════ */
function QRWaitPhase({
  sessionCode, qrDataUrl, qrPayload, mobileConnected, showDemoBtn, sessionError,
  onDemoMode, onBack,
}: {
  sessionCode: string;
  qrDataUrl: string | null;
  qrPayload: string | null;
  mobileConnected: boolean;
  showDemoBtn: boolean;
  sessionError: string | null;
  onDemoMode(): void;
  onBack(): void;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1500);
    return () => clearInterval(id);
  }, []);

  const steps = [
    { n:"1", icon:"scan",  col:"var(--blue)",   t:"Quét mã QR để mở liên kết tải ảnh"       },
    { n:"2", icon:"doc",   col:"var(--teal)",   t:"Chụp ảnh hoặc tải file tài liệu lên"     },
    { n:"3", icon:"check", col:"var(--green)",  t:"Nhấn Gửi — hệ thống AI tự xử lý"        },
  ];

  return (
    <div style={{ height:"100%", display:"flex", padding:"24px 80px", alignItems:"center", gap:80 }}>

      {/* Left — instructions */}
      <div style={{ flex:1 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ gap:6, marginBottom:32 }}>
          <Icon name="back" size={16}/> Quay lại
        </button>

        <h2 style={{ fontSize:40, fontWeight:900, color:"var(--ink-0)", marginBottom:12, lineHeight:1.15, letterSpacing:"-.02em" }}>
          Quét mã QR để<br/>
          <span style={{ color:"var(--blue)" }}>tải tài liệu lên</span>
        </h2>
        <p style={{ fontSize:16, color:"var(--ink-4)", marginBottom:40, lineHeight:1.7 }}>
          Mã QR dẫn đến trang tải ảnh trực tiếp trên hệ thống.
        </p>

        <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
          {steps.map(s => {
            const done = mobileConnected && parseInt(s.n) <= 1;
            return (
              <div key={s.n} style={{ display:"flex", gap:18, alignItems:"center" }}>
                <div style={{
                  width:48, height:48, borderRadius:"50%", flexShrink:0,
                  background: done ? "var(--green)" : s.col === "var(--blue)" ? "var(--blue-lt)"
                    : s.col === "var(--teal)" ? "var(--teal-lt)" : "var(--green-lt)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                  transition:"background .4s",
                  border: done ? "none" : `2px solid ${s.col}`,
                }}>
                  {done
                    ? <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="#fff" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>
                    : <Icon name={s.icon as Parameters<typeof Icon>[0]["name"]} size={22} style={{ color: s.col }}/>
                  }
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:"var(--ink-5)", letterSpacing:".08em", marginBottom:2 }}>
                    BƯỚC {s.n}
                  </div>
                  <div style={{ fontSize:17, fontWeight:600, color: done ? "var(--green)" : "var(--ink-1)", transition:"color .4s" }}>
                    {s.t}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Demo fallback */}
        {showDemoBtn && !mobileConnected && (
          <div style={{
            marginTop:36, padding:"18px 22px", background:"var(--orange-lt)",
            borderRadius:16, border:"1.5px dashed var(--orange)",
            display:"flex", alignItems:"center", gap:16,
            animation:"fadeUp .4s ease both",
          }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:700, color:"var(--orange-dk)", marginBottom:4 }}>
                Chưa nhận được ảnh?
              </div>
              <div style={{ fontSize:13, color:"var(--ink-4)", lineHeight:1.5 }}>
                Sử dụng chế độ thử nghiệm để xem quy trình mẫu.
              </div>
            </div>
            <button onClick={onDemoMode} style={{
              padding:"10px 20px", borderRadius:10,
              background:"var(--orange)", border:"none",
              color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", flexShrink:0,
            }}>Dùng demo</button>
          </div>
        )}
      </div>

      {/* Right — QR card (centrepiece) */}
      <div style={{
        width:500, flexShrink:0, background:"#fff", borderRadius:28,
        border: mobileConnected ? "2px solid var(--green)" : "2px solid var(--ink-7)",
        boxShadow:"var(--shadow-xl)",
        padding:"44px 40px", display:"flex", flexDirection:"column", alignItems:"center",
        transition:"border-color .4s",
      }}>
        {/* Pulse ring + QR */}
        <div style={{ position:"relative", marginBottom:32 }}>
          <div style={{
            position:"absolute", inset:-16, borderRadius:20,
            border:`3px solid ${mobileConnected ? "var(--green)" : "var(--blue)"}`,
            opacity: tick % 2 === 0 ? 0.12 : 0.32,
            transform: tick % 2 === 0 ? "scale(1)" : "scale(1.04)",
            transition:"all 1.5s ease",
            pointerEvents:"none",
          }}/>
          {qrDataUrl
            ? <img src={qrDataUrl} width={260} height={260}
                alt="QR Code" style={{ borderRadius:8, display:"block" }}/>
            : qrPayload
              /* qrPayload received, QR still rendering (should be <200ms) */
              ? (
                <div style={{
                  width:260, height:260, borderRadius:8, background:"var(--ink-8)",
                  display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12,
                }}>
                  <Spinner size={32}/>
                  <span style={{ fontSize:13, color:"var(--ink-4)" }}>Đang tạo mã QR…</span>
                </div>
              )
              /* qrPayload not yet received — waiting for API or error */
              : (
                <div style={{
                  width:260, height:260, borderRadius:8,
                  background: sessionError ? "var(--red-lt, #fff0f0)" : "var(--ink-8)",
                  display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:12,
                  padding:16, textAlign:"center",
                }}>
                  {sessionError
                    ? <>
                        <svg viewBox="0 0 24 24" width={36} height={36} fill="none" stroke="var(--red, #e53e3e)" strokeWidth={2} strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="12" cy="16" r="1" fill="var(--red, #e53e3e)" stroke="none"/></svg>
                        <span style={{ fontSize:12, color:"var(--red, #e53e3e)", fontWeight:600, lineHeight:1.4 }}>
                          Lỗi khởi tạo phiên
                        </span>
                        <span style={{ fontSize:10, color:"var(--ink-4)", fontFamily:"monospace", wordBreak:"break-all", lineHeight:1.4 }}>
                          {sessionError.slice(0, 120)}
                        </span>
                      </>
                    : <>
                        <Spinner size={32}/>
                        <span style={{ fontSize:13, color:"var(--ink-4)" }}>Đang khởi tạo phiên…</span>
                      </>
                  }
                </div>
              )
          }
        </div>

        {/* Session code */}
        <div style={{
          background:"var(--ink-8)", borderRadius:12, padding:"12px 28px",
          marginBottom:24, textAlign:"center", width:"100%",
        }}>
          <div style={{ fontSize:11, color:"var(--ink-4)", fontWeight:700, letterSpacing:".08em", marginBottom:4 }}>
            MÃ PHIÊN
          </div>
          <div style={{ fontSize:24, fontWeight:900, color:"var(--ink-0)", letterSpacing:".2em", fontVariantNumeric:"tabular-nums" }}>
            {sessionCode}
          </div>
        </div>

        {/* Status */}
        {mobileConnected ? (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8, animation:"pop .4s cubic-bezier(.34,1.56,.64,1) both" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:10, height:10, borderRadius:"50%", background:"var(--green)", animation:"blink 1.2s infinite" }}/>
              <span style={{ fontSize:16, color:"var(--green)", fontWeight:700 }}>Đã kết nối — đang chờ ảnh tài liệu...</span>
            </div>
          </div>
        ) : (
          <div style={{ textAlign:"center" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, marginBottom:6 }}>
              <div style={{ width:8, height:8, borderRadius:"50%",
                background: qrDataUrl ? "var(--green)" : "var(--blue)",
                animation:"blink 1.5s infinite" }}/>
              <span style={{ fontSize:14, fontWeight:600,
                color: qrDataUrl ? "var(--green)" : "var(--ink-3)" }}>
                {qrDataUrl
                  ? "Mã QR sẵn sàng — đang chờ tải ảnh lên..."
                  : qrPayload ? "Đang tạo mã QR..." : "Đang khởi tạo phiên làm việc..."}
              </span>
            </div>
            <div style={{ fontSize:12, color:"var(--ink-5)" }}>
              Hết hạn sau&nbsp;<strong style={{ color:"var(--orange)" }}>10:00</strong> phút
            </div>
            {/* Debug URL — visible for admin verification */}
            {qrPayload && (
              <div style={{
                marginTop:12, background:"var(--ink-8)", borderRadius:8, padding:"8px 12px",
              }}>
                <div style={{ fontSize:10, fontWeight:700, color:"var(--ink-4)", letterSpacing:".06em", marginBottom:2 }}>
                  URL
                </div>
                <div style={{ fontSize:11, color:"var(--blue)", fontWeight:600, wordBreak:"break-all", fontFamily:"monospace", lineHeight:1.4 }}>
                  {qrPayload}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PHASE — Uploading
══════════════════════════════════════════════════════ */
function UploadingPhase() {
  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:32 }}>
      <div style={{ position:"relative" }}>
        <div style={{
          width:120, height:120, borderRadius:"50%", background:"var(--teal-lt)",
          display:"flex", alignItems:"center", justifyContent:"center",
        }}>
          <Icon name="scan" size={52} style={{ color:"var(--teal)" }}/>
        </div>
        <div style={{
          position:"absolute", bottom:-4, right:-4, width:36, height:36, borderRadius:"50%",
          background:"var(--green)", display:"flex", alignItems:"center", justifyContent:"center",
          animation:"pop .4s cubic-bezier(0.34,1.56,0.64,1) both",
        }}>
          <Icon name="check" size={18} style={{ color:"#fff" }}/>
        </div>
      </div>
      <div style={{ textAlign:"center" }}>
        <h2 style={{ fontSize:30, fontWeight:800, color:"var(--ink-0)", marginBottom:10 }}>Đang nhận tài liệu...</h2>
        <p style={{ fontSize:17, color:"var(--ink-4)" }}>Hệ thống đang nhận ảnh tài liệu từ thiết bị của bạn.</p>
      </div>
      <div style={{ width:420 }}>
        {["Hình ảnh mặt trước","Hình ảnh mặt sau"].map((label,i) => (
          <div key={label} style={{ marginBottom:20 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8, fontSize:14, fontWeight:600, color:"var(--ink-3)" }}>
              <span>{label}</span>
              <span style={{ color:"var(--teal)" }}>Đã nhận ✓</span>
            </div>
            <div style={{ height:8, borderRadius:999, background:"var(--ink-7)", overflow:"hidden" }}>
              <div style={{
                height:"100%", borderRadius:999, background:"var(--teal)",
                animation:`growBar .8s ${i*0.35}s ease-out both`,
              }}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PHASE — Processing (OCR + AI detection)
══════════════════════════════════════════════════════ */
function ProcessingPhase({ step, detected }: { step:number; detected:DetectedDoc|null }) {
  const done = detected !== null;

  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:32 }}>
      {/* Animated icon */}
      <div style={{ position:"relative", width:130, height:130 }}>
        <div style={{
          position:"absolute", inset:0, borderRadius:"50%",
          background: done ? "var(--green-lt)" : "var(--blue-lt)",
          display:"flex", alignItems:"center", justifyContent:"center",
          transition:"background .4s",
        }}>
          <Icon name="doc" size={56} style={{ color: done?"var(--green)":"var(--blue)", transition:"color .4s" }}/>
        </div>
        {!done && (
          <svg style={{ position:"absolute", inset:0, animation:"spin 2s linear infinite" }}
            viewBox="0 0 130 130" width={130} height={130}>
            <circle cx={65} cy={65} r={60} fill="none" stroke="var(--blue)" strokeWidth={3}
              strokeDasharray="90 290" strokeLinecap="round"/>
          </svg>
        )}
        {done && (
          <svg style={{ position:"absolute", inset:0, animation:"pop .45s cubic-bezier(0.34,1.56,0.64,1) both" }}
            viewBox="0 0 130 130" width={130} height={130}>
            <circle cx={65} cy={65} r={60} fill="none" stroke="var(--green)" strokeWidth={3}/>
          </svg>
        )}
      </div>

      <div style={{ textAlign:"center", maxWidth:580 }}>
        <h2 style={{ fontSize:32, fontWeight:800, color:"var(--ink-0)", marginBottom:14 }}>
          {done ? "Nhận diện thành công!" : "Hệ thống đang nhận diện giấy tờ"}
        </h2>
        <p style={{ fontSize:19, color: done?"var(--green)":"var(--blue)", fontWeight:600, minHeight:28, transition:"color .3s" }}>
          {done ? `Đã phát hiện: ${detected!.label}` : PROC_MSGS[step]}
        </p>
      </div>

      {/* Confidence / progress indicator */}
      {!done ? (
        <div style={{ display:"flex", gap:8 }}>
          {PROC_MSGS.map((_,i) => (
            <div key={i} style={{
              width: i===step ? 28 : 8, height:8, borderRadius:999,
              background: i<=step ? "var(--blue)" : "var(--ink-6)",
              transition:"all .3s ease",
            }}/>
          ))}
        </div>
      ) : (
        <div style={{
          display:"flex", flexDirection:"column", alignItems:"center", gap:16,
          animation:"fadeUp .4s ease both",
        }}>
          {/* Detected type card */}
          <div style={{
            display:"flex", alignItems:"center", gap:20, padding:"22px 32px",
            background:"#fff", borderRadius:20, border:`2px solid ${detected!.color}`,
            boxShadow:`0 0 0 4px ${detected!.bg}`, width:480,
          }}>
            <div style={{
              width:64, height:64, borderRadius:16, background:detected!.bg,
              display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
            }}>
              <Icon name={detected!.icon as Parameters<typeof Icon>[0]["name"]} size={32} style={{ color:detected!.color }}/>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:12, fontWeight:700, color:detected!.color, letterSpacing:".06em", marginBottom:3 }}>
                LOẠI GIẤY TỜ PHÁT HIỆN
              </div>
              <div style={{ fontSize:22, fontWeight:800, color:"var(--ink-0)", marginBottom:4 }}>{detected!.label}</div>
              <div style={{ fontSize:13, color:"var(--ink-4)" }}>{detected!.labelEn}</div>
            </div>
            {/* Confidence badge */}
            <div style={{
              display:"flex", flexDirection:"column", alignItems:"center",
              padding:"10px 16px", borderRadius:12, background:detected!.bg, flexShrink:0,
            }}>
              <div style={{ fontSize:26, fontWeight:900, color:detected!.color, letterSpacing:"-.02em" }}>
                {pct(detected!.confidence)}
              </div>
              <div style={{ fontSize:11, fontWeight:700, color:detected!.color, letterSpacing:".04em" }}>ĐỘ CHÍNH XÁC</div>
            </div>
          </div>
          <p style={{ fontSize:14, color:"var(--ink-5)" }}>
            Bạn có thể điều chỉnh loại giấy tờ ở bước tiếp theo nếu nhận diện chưa đúng.
          </p>
        </div>
      )}

      {!done && (
        <p style={{ fontSize:15, color:"var(--ink-5)", textAlign:"center", lineHeight:1.65 }}>
          Vui lòng không chạm màn hình.<br/>Quá trình này thường mất dưới 30 giây.
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PHASE — Preview / Four-corner editor  (ENHANCED)
══════════════════════════════════════════════════════ */
const PW = 680, PH = 440;

function CornerHandle({
  cx, cy, isDragging, onDown,
}: {
  cx:number; cy:number; isDragging:boolean;
  onDown(e:React.PointerEvent):void;
}) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={28} fill={isDragging?"rgba(0,104,183,.2)":"rgba(0,104,183,.1)"}/>
      <circle cx={cx} cy={cy} r={15}
        fill={isDragging ? "var(--blue)" : "#fff"}
        stroke="var(--blue)" strokeWidth={3}
        style={{ cursor:"grab", touchAction:"none" }}
        onPointerDown={onDown}/>
      <line x1={cx-8} y1={cy} x2={cx+8} y2={cy}
        stroke={isDragging?"#fff":"var(--blue)"} strokeWidth={2.5}/>
      <line x1={cx} y1={cy-8} x2={cx} y2={cy+8}
        stroke={isDragging?"#fff":"var(--blue)"} strokeWidth={2.5}/>
    </g>
  );
}

/* Simulated document background — looks like a real ID card */
function DocBackground() {
  return (
    <div style={{
      position:"absolute", inset:0,
      background:"linear-gradient(148deg,#f5f0e8,#ede7d9)",
      display:"flex", alignItems:"center", justifyContent:"center",
    }}>
      {/* Simulated CCCD layout */}
      <div style={{
        width:"70%", height:"72%",
        background:"#fff",
        borderRadius:6,
        boxShadow:"0 8px 32px rgba(0,0,0,.18)",
        padding:"16px 20px",
        display:"flex", flexDirection:"column", gap:6,
        overflow:"hidden",
      }}>
        {/* Header bar */}
        <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:4 }}>
          <div style={{ width:32, height:32, borderRadius:"50%", background:"#b91c1c", flexShrink:0 }}/>
          <div>
            <div style={{ width:120, height:7, background:"#991b1b", borderRadius:3 }}/>
            <div style={{ width:80, height:5, background:"#e5e7eb", borderRadius:3, marginTop:4 }}/>
          </div>
          <div style={{ marginLeft:"auto", width:50, height:50, background:"#f3f4f6", borderRadius:4 }}/>
        </div>
        <div style={{ height:1, background:"#e5e7eb" }}/>
        <div style={{ display:"flex", gap:10, paddingTop:4 }}>
          {/* Photo placeholder */}
          <div style={{ width:60, height:78, background:"#dbeafe", borderRadius:3, flexShrink:0, border:"1px solid #bfdbfe" }}/>
          <div style={{ flex:1, display:"flex", flexDirection:"column", gap:5 }}>
            {[100,140,90,120,80,110,70].map((w,i) => (
              <div key={i} style={{ display:"flex", gap:6, alignItems:"center" }}>
                <div style={{ width:48, height:5, background:"#9ca3af", borderRadius:3 }}/>
                <div style={{ width:`${w}px`, height:5, background:i%3===0?"#1e40af":i%3===1?"#374151":"#6b7280", borderRadius:3 }}/>
              </div>
            ))}
          </div>
        </div>
        <div style={{ height:1, background:"#e5e7eb", marginTop:4 }}/>
        <div style={{ display:"flex", gap:8, marginTop:2 }}>
          <div style={{ width:60, height:18, background:"#fef08a", borderRadius:3, border:"1px solid #eab308" }}/>
          <div style={{ width:100, height:18, background:"#f3f4f6", borderRadius:3 }}/>
        </div>
      </div>
    </div>
  );
}

function PreviewPhase({
  pages, activePage, onSelectPage,
  corners, detected, previewRef, dragging,
  onPointerDown, onPointerMove, onPointerUp,
  onReset, onConfirm, onBack,
}: {
  pages: { url:string; corners:Corner[] }[];
  activePage: number;
  onSelectPage(i:number):void;
  corners:Corner[]; detected:DetectedDoc|null;
  previewRef:React.RefObject<HTMLDivElement|null>;
  dragging:number|null;
  onPointerDown(e:React.PointerEvent,idx:number):void;
  onPointerMove(e:React.PointerEvent):void;
  onPointerUp():void;
  onReset():void; onConfirm():void; onBack():void;
}) {
  const activeUrl = pages[activePage]?.url || "";
  const multi = pages.length > 1;
  // Compute bounding box of current corners for crop preview
  const minX = Math.min(...corners.map(c=>c.x));
  const maxX = Math.max(...corners.map(c=>c.x));
  const minY = Math.min(...corners.map(c=>c.y));
  const maxY = Math.max(...corners.map(c=>c.y));
  const cpPoly = corners.map(c=>`${(c.x*100).toFixed(1)}% ${(c.y*100).toFixed(1)}%`).join(", ");

  return (
    <div style={{ height:"100%", display:"flex", padding:"12px 40px 16px", gap:32, alignItems:"center" }}>

      {/* ── Left info panel ─────────────────────── */}
      <div style={{ width:300, flexShrink:0, display:"flex", flexDirection:"column", gap:14 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ gap:6, width:"fit-content" }}>
          <Icon name="back" size={16}/> Quay lại
        </button>

        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:"var(--ink-0)", marginBottom:6 }}>
            {multi ? `Căn chỉnh trang ${activePage+1}/${pages.length}` : "Kiểm tra vùng tài liệu"}
          </h2>
          <p style={{ fontSize:13, color:"var(--ink-4)", lineHeight:1.65 }}>
            Kéo 4 góc màu xanh để căn chỉnh đúng mép tài liệu.
            {multi && " Chọn từng trang ở dải bên dưới để căn chỉnh riêng."}
          </p>
        </div>

        {/* Detected type card */}
        {detected && (
          <div style={{
            background:detected.bg, borderRadius:14, padding:"14px 16px",
            border:`1.5px solid ${detected.color}22`,
          }}>
            <div style={{ fontSize:11, fontWeight:700, color:detected.color, letterSpacing:".06em", marginBottom:6 }}>
              LOẠI GIẤY TỜ
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
              <Icon name={detected.icon as Parameters<typeof Icon>[0]["name"]} size={20} style={{ color:detected.color }}/>
              <span style={{ fontSize:16, fontWeight:800, color:"var(--ink-0)" }}>{detected.label}</span>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:10 }}>
              <div style={{ flex:1, height:6, borderRadius:999, background:"rgba(0,0,0,.08)", overflow:"hidden" }}>
                <div style={{
                  height:"100%", borderRadius:999, background:detected.color,
                  width:`${detected.confidence*100}%`, transition:"width .6s ease",
                }}/>
              </div>
              <span style={{ fontSize:13, fontWeight:700, color:detected.color }}>{pct(detected.confidence)}</span>
            </div>
            <div style={{
              display:"flex", alignItems:"center", justifyContent:"center", gap:6,
              width:"100%", padding:"7px", borderRadius:8,
              background:"rgba(0,0,0,.04)", color:"var(--ink-4)",
              fontSize:12, fontWeight:600,
            }}>
              <Icon name="check" size={14} style={{ color:detected.color }}/>
              Tự động nhận diện bởi AI
            </div>
          </div>
        )}

        {/* Tips */}
        <div style={{ background:"var(--blue-lt)", borderRadius:12, padding:"12px 14px" }}>
          {[
            "4 góc chạm chính xác mép giấy tờ",
            "Toàn bộ nội dung nằm trong vùng chọn",
            "Nhấn Đặt lại về vị trí AI đề xuất",
          ].map(tip => (
            <div key={tip} style={{ display:"flex", gap:8, alignItems:"flex-start", marginBottom:8 }}>
              <div style={{ width:5, height:5, borderRadius:"50%", background:"var(--blue)", marginTop:6, flexShrink:0 }}/>
              <span style={{ fontSize:12, color:"var(--blue-dk)", lineHeight:1.5 }}>{tip}</span>
            </div>
          ))}
        </div>

        <button className="btn btn-ghost btn-sm" onClick={onReset} style={{ gap:6, fontSize:13 }}>
          ↺ Khôi phục vị trí AI
        </button>

        <div style={{ flex:1 }}/>
        <button className="btn btn-primary btn-lg" onClick={onConfirm} style={{ gap:8 }}>
          {multi ? `Xác nhận ${pages.length} trang` : "Xác nhận vùng này"}
          <Icon name="arrow" size={18} style={{ color:"#fff" }}/>
        </button>
      </div>

      {/* ── Centre — draggable 4-corner editor ─── */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:10 }}>
        <div style={{
          fontSize:12, fontWeight:600, color:"var(--ink-4)", letterSpacing:".04em",
          textTransform:"uppercase",
        }}>
          ← Kéo các góc để căn chỉnh →
        </div>
        <div
          ref={previewRef}
          style={{
            position:"relative", width:PW, height:PH, borderRadius:14,
            overflow:"hidden", boxShadow:"var(--shadow-xl)",
            cursor: dragging!==null ? "grabbing":"default",
            userSelect:"none", flexShrink:0,
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* Real uploaded image (active page) or fallback mock */}
          {activeUrl
            ? <img
                src={activeUrl}
                alt="Tài liệu đã tải lên"
                style={{
                  position:"absolute", inset:0,
                  width:"100%", height:"100%",
                  objectFit:"cover", objectPosition:"center",
                  pointerEvents:"none",
                }}
              />
            : <DocBackground/>
          }

          {/* Dark mask outside selection */}
          <svg style={{ position:"absolute",inset:0,pointerEvents:"none" }} width={PW} height={PH}>
            <defs>
              <mask id="cpmask">
                <rect width={PW} height={PH} fill="white"/>
                <polygon points={corners.map(c=>`${c.x*PW},${c.y*PH}`).join(" ")} fill="black"/>
              </mask>
            </defs>
            <rect width={PW} height={PH} fill="rgba(15,23,42,.56)" mask="url(#cpmask)"/>
          </svg>

          {/* Edges + corner handles */}
          <svg style={{ position:"absolute",inset:0 }} width={PW} height={PH} viewBox={`0 0 ${PW} ${PH}`}>
            {/* Dashed selection border */}
            <polygon
              points={corners.map(c=>`${c.x*PW},${c.y*PH}`).join(" ")}
              fill="none" stroke="rgba(37,99,235,.8)" strokeWidth={2} strokeDasharray="12 6"
            />
            {/* Corner L-brackets for precise alignment */}
            {corners.map((c,idx) => {
              const cx=c.x*PW, cy=c.y*PH;
              const nx=corners[(idx+1)%4]; const px=corners[(idx+3)%4];
              const dx1=(nx.x-c.x)*0.12*PW, dy1=(nx.y-c.y)*0.12*PH;
              const dx2=(px.x-c.x)*0.12*PW, dy2=(px.y-c.y)*0.12*PH;
              return (
                <g key={`bracket-${idx}`}>
                  <line x1={cx} y1={cy} x2={cx+dx1} y2={cy+dy1} stroke="var(--blue)" strokeWidth={3} strokeLinecap="round"/>
                  <line x1={cx} y1={cy} x2={cx+dx2} y2={cy+dy2} stroke="var(--blue)" strokeWidth={3} strokeLinecap="round"/>
                </g>
              );
            })}
            {/* Drag handles */}
            {corners.map((c,idx) => (
              <CornerHandle key={idx}
                cx={c.x*PW} cy={c.y*PH}
                isDragging={dragging===idx}
                onDown={e => onPointerDown(e, idx)}
              />
            ))}
          </svg>
        </div>
        <p style={{ fontSize:12, color:"var(--ink-5)" }}>Vùng sáng sẽ được đưa vào bản sao</p>

        {/* ── Page thumbnail strip (multi-page navigation) ── */}
        {multi && (
          <div style={{
            display:"flex", gap:10, alignItems:"center", justifyContent:"center",
            flexWrap:"wrap", maxWidth:PW, marginTop:4,
          }}>
            {pages.map((p, i) => (
              <button key={i}
                onClick={() => onSelectPage(i)}
                style={{
                  position:"relative", width:64, height:84, borderRadius:8, overflow:"hidden",
                  border:`2.5px solid ${i===activePage ? "var(--blue)" : "var(--ink-7)"}`,
                  padding:0, cursor:"pointer", background:"var(--ink-8)", flexShrink:0,
                  boxShadow: i===activePage ? "0 0 0 3px rgba(37,99,235,.2)" : "none",
                }}
              >
                {p.url
                  ? <img src={p.url} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                  : <DocBackground/>
                }
                <span style={{
                  position:"absolute", left:4, top:4, minWidth:18, height:18, padding:"0 4px",
                  borderRadius:99, background: i===activePage ? "var(--blue)" : "rgba(15,23,42,.7)",
                  color:"#fff", fontSize:11, fontWeight:800,
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>{i+1}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Right — crop preview ─────────────────── */}
      <div style={{ width:280, flexShrink:0, display:"flex", flexDirection:"column", gap:10 }}>
        <div style={{
          fontSize:12, fontWeight:700, color:"var(--ink-3)", letterSpacing:".04em",
          textTransform:"uppercase", textAlign:"center",
        }}>Xem trước kết quả</div>

        {/* Perspective-crop preview via clip-path */}
        <div style={{
          width:280, height:200, borderRadius:12, overflow:"hidden",
          background:detected?.bg ?? "var(--ink-8)",
          position:"relative",
          boxShadow:"var(--shadow-md)",
          border:"1.5px solid var(--ink-6)",
        }}>
          {/* Scaled document within the crop bounds */}
          <div style={{
            position:"absolute",
            left:`${-minX/(maxX-minX)*100}%`,
            top:`${-minY/(maxY-minY)*100}%`,
            width:`${100/(maxX-minX)}%`,
            height:`${100/(maxY-minY)}%`,
            clipPath:`polygon(${cpPoly})`,
            transformOrigin:"top left",
          }}>
            <div style={{ position:"relative", width:"100%", paddingTop:`${(PH/PW*100)}%` }}>
              <div style={{ position:"absolute", inset:0 }}>
                {activeUrl
                  ? <img src={activeUrl} alt=""
                      style={{ width:"100%", height:"100%", objectFit:"cover", pointerEvents:"none" }}/>
                  : <DocBackground/>
                }
              </div>
            </div>
          </div>
          {/* Overlay label */}
          <div style={{
            position:"absolute", bottom:0, left:0, right:0,
            background:"rgba(15,23,42,.65)", padding:"8px 12px",
          }}>
            <div style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,.8)" }}>
              {detected?.label ?? "Tài liệu"} · {pct(maxX-minX)} × {pct(maxY-minY)}
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ background:"#fff", borderRadius:12, padding:"14px", border:"1.5px solid var(--ink-7)" }}>
          {[
            { l:"Góc trái-trên",  v:`${pct(corners[0].x)}, ${pct(corners[0].y)}` },
            { l:"Góc phải-trên",  v:`${pct(corners[1].x)}, ${pct(corners[1].y)}` },
            { l:"Góc phải-dưới", v:`${pct(corners[2].x)}, ${pct(corners[2].y)}` },
            { l:"Góc trái-dưới", v:`${pct(corners[3].x)}, ${pct(corners[3].y)}` },
          ].map(r => (
            <div key={r.l} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid var(--ink-8)" }}>
              <span style={{ fontSize:12, color:"var(--ink-4)" }}>{r.l}</span>
              <span style={{ fontSize:12, fontWeight:600, color:"var(--ink-2)", fontVariantNumeric:"tabular-nums" }}>{r.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PHASE — Quantity + Fee  (uses detected category)
══════════════════════════════════════════════════════ */
function QtyFeePhase({
  detected, quantity, onQtyChange,
  fee, taxFee, totalFee, onConfirm, onBack,
}: {
  detected:DetectedDoc; quantity:number;
  onQtyChange(q:number):void;
  fee:number; taxFee:number; totalFee:number;
  onConfirm():void; onBack():void;
}) {
  return (
    <div style={{ height:"100%", display:"flex", padding:"24px 80px", gap:80, alignItems:"center" }}>
      {/* Left */}
      <div style={{ flex:1 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ gap:6, marginBottom:28 }}>
          <Icon name="back" size={16}/> Quay lại
        </button>

        {/* Auto-detected type badge */}
        <div style={{
          display:"flex", alignItems:"center", gap:16, padding:"18px 22px",
          background:detected.bg, borderRadius:16,
          border:`2px solid ${detected.color}`, marginBottom:32,
        }}>
          <div style={{
            width:52, height:52, borderRadius:14, background:detected.color,
            display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
          }}>
            <Icon name={detected.icon as Parameters<typeof Icon>[0]["name"]} size={26} style={{ color:"#fff" }}/>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, fontWeight:700, color:detected.color, letterSpacing:".06em", marginBottom:3 }}>
              {`AI NHẬN DIỆN · ${pct(detected.confidence)} CHÍNH XÁC`}
            </div>
            <div style={{ fontSize:20, fontWeight:800, color:"var(--ink-0)" }}>{detected.label}</div>
          </div>
        </div>

        {/* Qty picker */}
        <h3 style={{ fontSize:22, fontWeight:800, color:"var(--ink-0)", marginBottom:20 }}>Số lượng bản sao</h3>
        <div style={{ display:"flex", alignItems:"center", gap:20 }}>
          <button onClick={() => onQtyChange(Math.max(1, quantity-1))} style={{
            width:68, height:68, borderRadius:16, border:"2px solid var(--ink-6)",
            background:"#fff", fontSize:32, fontWeight:300, cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center",
            color: quantity<=1 ? "var(--ink-6)" : "var(--ink-2)",
            transition:"all .15s",
          }}>−</button>

          <div style={{
            width:120, height:68, borderRadius:16, background:detected.bg,
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:40, fontWeight:900, color:detected.color,
          }}>{quantity}</div>

          <button onClick={() => onQtyChange(Math.min(10, quantity+1))} style={{
            width:68, height:68, borderRadius:16, border:`2px solid ${detected.color}`,
            background:detected.color, fontSize:32, color:"#fff", cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center",
            transition:"background .15s",
          }}>+</button>
          <span style={{ fontSize:15, color:"var(--ink-4)", fontWeight:500 }}>bản sao (tối đa 10)</span>
        </div>
      </div>

      {/* Right — Fee card */}
      <div style={{ width:440, flexShrink:0 }}>
        <div style={{ background:"#fff", borderRadius:24, border:"1.5px solid var(--ink-7)", boxShadow:"var(--shadow-xl)", overflow:"hidden" }}>
          <div style={{ background:detected.color, padding:"24px 28px" }}>
            <div style={{ fontSize:13, color:"rgba(255,255,255,.75)", fontWeight:600, marginBottom:4 }}>TỔNG PHÍ DỰ TÍNH</div>
            <div style={{ fontSize:48, fontWeight:900, color:"#fff", letterSpacing:"-.02em" }}>{fmtVND(totalFee)}</div>
          </div>
          <div style={{ padding:"22px 28px" }}>
            {[
              { l:"Phí sao y",              v: fmtVND(fee)    },
              { l:`${quantity} bản × ${fmtVND(detected.price)}/bản`, v:"" },
              { l:"Phí xử lý (10%)",        v: fmtVND(taxFee) },
            ].map(r => r.v ? (
              <div key={r.l} style={{ display:"flex", justifyContent:"space-between", padding:"11px 0", borderBottom:"1px solid var(--ink-7)" }}>
                <span style={{ fontSize:15, color:"var(--ink-4)" }}>{r.l}</span>
                <span style={{ fontSize:15, fontWeight:700, color:"var(--ink-1)" }}>{r.v}</span>
              </div>
            ) : (
              <div key={r.l} style={{ fontSize:12, color:"var(--ink-5)", padding:"4px 0 12px", borderBottom:"1px solid var(--ink-7)" }}>{r.l}</div>
            ))}
            <div style={{ display:"flex", justifyContent:"space-between", padding:"16px 0 0" }}>
              <span style={{ fontSize:17, fontWeight:800, color:"var(--ink-0)" }}>Tổng cộng</span>
              <span style={{ fontSize:20, fontWeight:900, color:detected.color }}>{fmtVND(totalFee)}</span>
            </div>
            <div style={{
              marginTop:10, padding:"10px 14px", background:"var(--orange-lt)",
              borderRadius:10, display:"flex", gap:8, alignItems:"flex-start",
            }}>
              <Icon name="help" size={16} style={{ color:"var(--orange)", marginTop:1, flexShrink:0 }}/>
              <span style={{ fontSize:13, color:"#92400E", lineHeight:1.5 }}>
                Phí thanh toán sau khi xác nhận. Phiếu thu in kèm bản sao.
              </span>
            </div>
          </div>
        </div>

        <button className="btn btn-primary btn-xl" onClick={onConfirm}
          style={{ width:"100%", marginTop:20, gap:10 }}>
          Xác nhận & Tiến hành
          <Icon name="arrow" size={22} style={{ color:"#fff" }}/>
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PHASE — Fee Confirm
══════════════════════════════════════════════════════ */
function FeeConfirmPhase({
  totalFee, quantity, detected, onConfirm, onBack,
}: {
  totalFee:number; quantity:number; detected:DetectedDoc;
  onConfirm():void; onBack():void;
}) {
  const [ok, setOk] = useState(false);
  return (
    <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", padding:40 }}>
      <div style={{
        width:720, background:"#fff", borderRadius:28, padding:"48px 56px",
        boxShadow:"var(--shadow-xl)", border:"1.5px solid var(--ink-7)", textAlign:"center",
        animation:"fadeUp .35s ease both",
      }}>
        <div style={{
          width:80, height:80, borderRadius:"50%", background:"var(--orange-lt)",
          display:"flex", alignItems:"center", justifyContent:"center",
          margin:"0 auto 24px",
        }}>
          <Icon name="help" size={36} style={{ color:"var(--orange)" }}/>
        </div>

        <h2 style={{ fontSize:30, fontWeight:900, color:"var(--ink-0)", marginBottom:12 }}>Xác nhận thanh toán</h2>
        <p style={{ fontSize:17, color:"var(--ink-4)", marginBottom:32, lineHeight:1.65 }}>
          Sau khi xác nhận, hệ thống sẽ tạo bản sao điện tử và in{" "}
          <strong style={{ color:"var(--ink-0)" }}>{quantity}</strong> bản sao<br/>
          tài liệu loại <strong style={{ color:"var(--ink-0)" }}>{detected.label}</strong>.
        </p>

        <div style={{
          background:"var(--ink-8)", borderRadius:16, padding:"22px 30px",
          display:"flex", justifyContent:"space-between", alignItems:"center",
          marginBottom:32, border:"2px solid var(--ink-7)",
        }}>
          <div style={{ textAlign:"left" }}>
            <div style={{ fontSize:13, color:"var(--ink-4)", marginBottom:4 }}>Tổng số tiền thanh toán</div>
            <div style={{ fontSize:42, fontWeight:900, color:detected.color }}>{fmtVND(totalFee)}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:13, color:"var(--ink-4)", marginBottom:4 }}>Số lượng bản sao</div>
            <div style={{ fontSize:42, fontWeight:900, color:"var(--ink-0)" }}>{quantity}</div>
          </div>
        </div>

        <div style={{ display:"flex", gap:16 }}>
          <button className="btn btn-ghost btn-lg" onClick={onBack} style={{ flex:1, gap:8 }}>
            <Icon name="back" size={18}/> Quay lại
          </button>
          <button
            className="btn btn-xl"
            onClick={() => { setOk(true); setTimeout(onConfirm, 420); }}
            style={{
              flex:2, gap:10, color:"#fff",
              background: ok ? "var(--green)" : "var(--orange)",
              boxShadow:`0 4px 16px rgba(${ok?"22,163,74":"245,158,11"},.3)`,
              transition:"background .3s",
            }}
          >
            {ok
              ? <><Icon name="check" size={22} style={{ color:"#fff" }}/> Đã xác nhận</>
              : "✓ Xác nhận & Tiến hành in"
            }
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PHASE — Generating PDF
══════════════════════════════════════════════════════ */
function GeneratingPhase() {
  const [doneCount, setDoneCount] = useState(0);
  const steps = [
    "Áp dụng hiệu chỉnh góc nhìn tài liệu",
    "Tạo PDF có mã QR xác thực pháp lý",
    "Ký số và đóng dấu thời gian",
    "Gửi lệnh in tới máy in tại quầy",
  ];

  useEffect(() => {
    const id = setInterval(() => setDoneCount(c => Math.min(c+1, steps.length)), 700);
    return () => clearInterval(id);
  }, [steps.length]);

  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:36 }}>
      <div style={{ position:"relative", width:100, height:100 }}>
        <Spinner size={100}/>
        <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
          <Icon name="doc" size={36} style={{ color:"var(--blue)" }}/>
        </div>
      </div>
      <div style={{ textAlign:"center" }}>
        <h2 style={{ fontSize:32, fontWeight:800, color:"var(--ink-0)", marginBottom:12 }}>Đang tạo bản sao điện tử</h2>
        <p style={{ fontSize:17, color:"var(--ink-4)", lineHeight:1.7 }}>
          Hệ thống đang tạo PDF có chữ ký số, mã QR xác thực<br/>và thông tin pháp lý cần thiết...
        </p>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:14, width:460 }}>
        {steps.map((s,i) => (
          <div key={s} style={{ display:"flex", gap:14, alignItems:"center", opacity: i<doneCount+1 ? 1 : 0.35, transition:"opacity .3s" }}>
            <div style={{
              width:26, height:26, borderRadius:"50%", flexShrink:0,
              background: i<doneCount ? "var(--green)" : "var(--ink-6)",
              display:"flex", alignItems:"center", justifyContent:"center",
              transition:`background .3s ${i*0.15}s`,
            }}>
              {i<doneCount
                ? <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="#fff" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>
                : <div style={{ width:8, height:8, borderRadius:"50%", background:"#fff" }}/>
              }
            </div>
            <span style={{ fontSize:16, color: i<doneCount?"var(--ink-1)":"var(--ink-5)", fontWeight: i<doneCount?600:400 }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PHASE — Printing
══════════════════════════════════════════════════════ */
function PrintingPhase() {
  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:36 }}>
      <div style={{
        width:220, height:160, borderRadius:20, background:"var(--ink-0)",
        position:"relative", overflow:"visible",
        boxShadow:"0 20px 60px rgba(15,23,42,.35)",
        display:"flex", alignItems:"flex-end", justifyContent:"center",
        padding:"0 0 20px",
      }}>
        <div style={{ position:"absolute", top:18, right:22, width:10, height:10, borderRadius:"50%", background:"var(--green)", animation:"blink 1s infinite" }}/>
        <div style={{ position:"absolute", top:36, left:"50%", transform:"translateX(-50%)", width:140, height:7, background:"var(--ink-2)", borderRadius:4 }}/>
        <div style={{
          position:"absolute", top:20, left:"50%", transform:"translateX(-50%)",
          width:120, background:"#fff", borderRadius:"0 0 4px 4px",
          animation:"paperOut 1.8s ease-in-out infinite",
          padding:"6px 10px",
        }}>
          {[60,80,50,70,55].map((w,i) => (
            <div key={i} style={{ height:4, background:"var(--ink-7)", borderRadius:2, width:`${w}%`, marginBottom:4 }}/>
          ))}
        </div>
        <div style={{ width:"80%", height:5, background:"var(--ink-2)", borderRadius:3 }}/>
      </div>

      <div style={{ textAlign:"center" }}>
        <h2 style={{ fontSize:32, fontWeight:800, color:"var(--ink-0)", marginBottom:12 }}>Đang in tài liệu</h2>
        <p style={{ fontSize:17, color:"var(--ink-4)", lineHeight:1.7 }}>
          Máy in đang hoạt động. Vui lòng chờ và lấy tài liệu tại khay in.
        </p>
      </div>
      <Spinner size={40}/>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PHASE — Success
══════════════════════════════════════════════════════ */
function SuccessPhase({
  receiptCode, detected, quantity, totalFee, onHome,
}: {
  receiptCode:string; detected:DetectedDoc;
  quantity:number; totalFee:number; onHome():void;
}) {
  return (
    <div style={{ height:"100%", display:"flex", padding:"24px 80px", gap:60, alignItems:"center" }}>
      <div style={{ flex:1 }}>
        <div style={{
          width:100, height:100, borderRadius:"50%", background:"var(--green-lt)",
          display:"flex", alignItems:"center", justifyContent:"center", marginBottom:28,
          animation:"pop .5s cubic-bezier(0.34,1.56,0.64,1) both",
        }}>
          <svg viewBox="0 0 24 24" width={52} height={52} fill="none" stroke="var(--green)" strokeWidth={2.5} strokeLinecap="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>

        <h1 style={{ fontSize:46, fontWeight:900, color:"var(--ink-0)", marginBottom:16, lineHeight:1.1 }}>
          Sao y hoàn tất!
        </h1>
        <p style={{ fontSize:18, color:"var(--ink-4)", lineHeight:1.75, marginBottom:36, maxWidth:520 }}>
          <strong style={{ color:"var(--ink-1)" }}>{quantity}</strong> bản sao tài liệu{" "}
          <strong style={{ color:detected.color }}>{detected.label}</strong> đã in thành công.
          Bản sao điện tử đã được lưu vào ví giấy tờ số của bạn.
        </p>

        <div style={{ display:"flex", gap:14, flexWrap:"wrap", marginBottom:32 }}>
          <button className="btn btn-soft btn-lg" style={{ gap:8 }}>
            <Icon name="wallet" size={20} style={{ color:"var(--blue)" }}/> Xem trong ví số
          </button>
          <button className="btn btn-soft btn-lg" style={{ gap:8 }}>
            <Icon name="print" size={20} style={{ color:"var(--blue)" }}/> In phiếu thu
          </button>
        </div>

        <button className="btn btn-primary btn-xl" onClick={onHome} style={{ gap:10 }}>
          <Icon name="home" size={22} style={{ color:"#fff" }}/> Về trang chủ
        </button>
      </div>

      {/* Receipt card */}
      <div style={{ width:480, flexShrink:0, animation:"pop .5s .15s cubic-bezier(0.34,1.56,0.64,1) both" }}>
        <div style={{
          background:"#fff", borderRadius:24, overflow:"hidden",
          boxShadow:"var(--shadow-xl)", border:"1.5px solid var(--ink-7)",
        }}>
          <div style={{ background:"var(--green)", padding:"22px 28px", color:"#fff" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
              <Icon name="check" size={22} style={{ color:"#fff" }}/>
              <span style={{ fontSize:15, fontWeight:700 }}>PHIẾU SAO Y ĐIỆN TỬ</span>
            </div>
            <div style={{ fontSize:13, opacity:.85 }}>UBND Phường Cửa Nam · Hà Nội</div>
          </div>

          <div style={{ padding:"22px 28px" }}>
            <div style={{
              display:"flex", gap:18, alignItems:"center", marginBottom:22,
              padding:"14px", background:"var(--ink-8)", borderRadius:12,
            }}>
              <FakeQR size={84}/>
              <div>
                <div style={{ fontSize:11, color:"var(--ink-4)", fontWeight:700, letterSpacing:".06em", marginBottom:5 }}>MÃ PHIẾU</div>
                <div style={{ fontSize:20, fontWeight:900, color:"var(--ink-0)", letterSpacing:".06em" }}>{receiptCode}</div>
                <div style={{ fontSize:12, color:"var(--ink-5)", marginTop:4 }}>Quét QR để xác thực bản sao</div>
              </div>
            </div>

            {[
              { l:"Loại giấy tờ",    v: detected.label },
              { l:"Số lượng bản sao",v: `${quantity} bản` },
              { l:"Tổng phí",        v: fmtVND(totalFee) },
              { l:"Thời gian",       v: new Date().toLocaleString("vi-VN") },
              { l:"Trạng thái",      v: "✅ Đã in thành công" },
            ].map(r => (
              <div key={r.l} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom:"1px solid var(--ink-7)" }}>
                <span style={{ fontSize:14, color:"var(--ink-4)" }}>{r.l}</span>
                <span style={{ fontSize:14, fontWeight:700, color:"var(--ink-1)" }}>{r.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ROOT SCREEN COMPONENT
══════════════════════════════════════════════════════ */
interface Props {
  lang: "vi" | "en";
  onLangChange: (l: "vi" | "en") => void;
  onBack: () => void;
  onHome: () => void;
  onHelp: () => void;
  sessionId?: string;
  kioskDeviceId?: string;
  deviceSerial?: string;
}

export function CopyDocScreen({ lang, onLangChange, onBack, onHome, onHelp, sessionId, kioskDeviceId, deviceSerial }: Props) {
  const [phase, setPhase]             = useState<Phase>("intro");
  const [detected, setDetected]       = useState<DetectedDoc | null>(null);
  const [quantity, setQuantity]       = useState(1);
  const [procStep, setProcStep]       = useState(0);
  /* Multi-page: each page has its own crop corners */
  const [pages, setPages]             = useState<{ url: string; corners: Corner[] }[]>([]);
  const [activePage, setActivePage]   = useState(0);
  const [dragging, setDragging]       = useState<number | null>(null);
  const previewRef                    = useRef<HTMLDivElement>(null);

  /* Real request / session state */
  const [requestId, setRequestId]     = useState<string | null>(null);
  const [scanToken, setScanToken]     = useState<string | null>(null);
  const [qrPayload, setQrPayload]     = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl]     = useState<string | null>(null);
  const [mobileConnected, setMobileConnected] = useState(false);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  /* Demo fallback — show "Dùng demo" after 15s in qr_wait if no phone connects */
  const [showDemoBtn, setShowDemoBtn] = useState(false);

  const [sessionCode] = useState(() => mkCode("SQ"));
  const [receiptCode] = useState(() => mkCode("SY"));

  /* ── Socket.IO for copy-doc WS events ─────────────────── */
  useEffect(() => {
    if (!deviceSerial) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let socket: any = null;
    let disposed = false;

    import("socket.io-client").then(({ io }) => {
      if (disposed) return;
      socket = io(`${WS_URL}/device`, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1500,
      });
      socket.on("connect", () => {
        socket?.emit("heartbeat", { deviceId: deviceSerial });
      });

      /* Mobile phone opened the page → show "Điện thoại đã kết nối" */
      socket.on("copydoc:scan_connected", () => {
        setMobileConnected(true);
        setShowDemoBtn(false);
      });

      /* Mobile uploaded the photo → advance to processing */
      socket.on("copydoc:scan_uploaded", () => {
        setPhase(prev =>
          prev === "qr_wait" || prev === "uploading" ? "processing" : prev
        );
      });

      /* AI result received → set detected category + corners + image, advance to preview */
      socket.on("copydoc:ai_result", (data: {
        corners: Corner[];
        categoryId: string | null;
        label: string;
        confidence: number;
        price: number;
        imageUrl?: string;
        pages?: { pageIndex: number; url: string }[];
      }) => {
        const doc: DetectedDoc = {
          id:        data.categoryId ?? "unknown",
          label:     data.label,
          labelEn:   data.label,
          icon:      "doc",
          price:     data.price,
          color:     "var(--blue)",
          bg:        "var(--blue-lt)",
          confidence: data.confidence,
        };
        setDetected(doc);

        const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
        const seed: Corner[] = (data.corners && data.corners.length === 4)
          ? data.corners : [...AI_DETECTED_CORNERS];

        let pageList: { url: string; corners: Corner[] }[] = [];
        if (data.pages && data.pages.length > 0) {
          pageList = [...data.pages]
            .sort((a, b) => a.pageIndex - b.pageIndex)
            .map(p => ({ url: `${apiBase}${p.url}`, corners: seed.map(c => ({ ...c })) }));
        } else if (data.imageUrl) {
          pageList = [{ url: `${apiBase}${data.imageUrl}`, corners: seed.map(c => ({ ...c })) }];
        }

        setPages(pageList);
        setActivePage(0);
        setUploadedImageUrl(pageList[0]?.url ?? null);
        setTimeout(() => setPhase("preview"), 900);
      });
    });

    return () => {
      disposed = true;
      socket?.disconnect();
    };
  // Only set up socket once when deviceSerial is available
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceSerial]);

  /* ── Generate QR code client-side whenever qrPayload changes ─────── */
  useEffect(() => {
    if (!qrPayload) { setQrDataUrl(null); return; }
    if (typeof window === "undefined") return; // SSR guard — canvas not available server-side

    let cancelled = false;

    (async () => {
      try {
        // Dynamic import avoids Next.js SSR breaking the canvas-based qrcode module
        const mod = await import("qrcode");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const QR = (mod as any).default ?? mod;
        const dataUrl: string = await QR.toDataURL(qrPayload, {
          width: 400,
          margin: 3,
          errorCorrectionLevel: "M",
          color: { dark: "#000000", light: "#FFFFFF" },
        });
        if (!cancelled) {
          setQrDataUrl(dataUrl);
          console.log("[CopyDoc] QR generated, payload:", qrPayload);
        }
      } catch (err) {
        console.error("[CopyDoc] QR generation failed:", err);
      }
    })();

    return () => { cancelled = true; };
  }, [qrPayload]);

  /* ── Initiate request + scan session when starting ─────── */
  async function onRealStart() {
    setPhase("qr_wait");
    setMobileConnected(false);
    setShowDemoBtn(false);
    setQrPayload(null);
    setQrDataUrl(null);
    setScanToken(null);
    setSessionError(null);
    setUploadedImageUrl(null);
    setPages([]);
    setActivePage(0);

    try {
      const req = await copyDocApi.initiateRequest(
        sessionId ?? `demo-${Date.now()}`,
        kioskDeviceId,
      );
      setRequestId(req.id);

      const scanSession = await copyDocApi.createScanSession(req.id);
      setScanToken(scanSession.sessionToken);
      setQrPayload(scanSession.qrPayload); // triggers QR generation via useEffect
      console.log("[CopyDoc] QR payload URL:", scanSession.qrPayload);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[CopyDoc] Session creation failed:", msg);
      setSessionError(msg);
    }
  }

  /* Demo fallback button: show after 15s if still in qr_wait with no phone */
  useEffect(() => {
    if (phase !== "qr_wait") { setShowDemoBtn(false); return; }
    const t = setTimeout(() => setShowDemoBtn(true), 15_000);
    return () => clearTimeout(t);
  }, [phase]);

  /* Demo mode: advance scan phases via timers (only when no real WS event) */
  useEffect(() => {
    // generating → printing → success are always timer-based (print is hardware)
    const map: Partial<Record<Phase, [Phase, number]>> = {
      generating: ["printing",   3200],
      printing:   ["success",    3600],
    };
    const entry = map[phase];
    if (!entry) return;
    const [next, ms] = entry;
    const t = setTimeout(() => setPhase(next), ms);
    return () => clearTimeout(t);
  }, [phase]);

  /* If demo button was pressed: simulate full scan flow quickly */
  function runDemoMode() {
    setShowDemoBtn(false);
    setPhase("uploading");
    setTimeout(() => setPhase("processing"), 1800);
    setTimeout(() => {
      const pick = DEMO_DETECTED[Math.floor(Math.random() * DEMO_DETECTED.length)];
      setDetected(pick);
      setPages([{ url: "", corners: [...AI_DETECTED_CORNERS] }]); // mock single page
      setActivePage(0);
      setTimeout(() => setPhase("preview"), 1400);
    }, 1800 + 4000);
  }

  /* Processing message rotation */
  useEffect(() => {
    if (phase !== "processing") return;
    setProcStep(0);
    const id = setInterval(() => setProcStep(s => Math.min(s + 1, PROC_MSGS.length - 1)), 900);
    return () => clearInterval(id);
  }, [phase]);

  /* Processing → demo OCR fallback (only if WS ai_result never comes) */
  useEffect(() => {
    if (phase !== "processing") return;
    // Give WS 8s to deliver result; if not received, run demo
    const t = setTimeout(() => {
      if (detected !== null) return; // WS already delivered
      const pick = DEMO_DETECTED[Math.floor(Math.random() * DEMO_DETECTED.length)];
      setDetected(pick);
      setPages([{ url: "", corners: [...AI_DETECTED_CORNERS] }]);
      setActivePage(0);
      const t2 = setTimeout(() => setPhase("preview"), 1800);
      return () => clearTimeout(t2);
    }, 8000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* Active page corners (derived) */
  const activeCorners: Corner[] = pages[activePage]?.corners ?? [...AI_DETECTED_CORNERS];

  /* Update the active page's corners */
  const setActiveCorners = useCallback((updater: (c: Corner[]) => Corner[]) => {
    setPages(prev => prev.map((p, i) => i !== activePage ? p : { ...p, corners: updater(p.corners) }));
  }, [activePage]);

  /* Corner drag — writes to the active page */
  const onPointerDown = useCallback((e: React.PointerEvent, idx: number) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(idx);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (dragging === null || !previewRef.current) return;
    const r = previewRef.current.getBoundingClientRect();
    setActiveCorners(prev => prev.map((c, i) => i !== dragging ? c : {
      x: Math.max(0.01, Math.min(0.99, (e.clientX - r.left)  / r.width)),
      y: Math.max(0.01, Math.min(0.99, (e.clientY - r.top) / r.height)),
    }));
  }, [dragging, setActiveCorners]);

  const onPointerUp = useCallback(() => setDragging(null), []);

  const fee      = (detected?.price ?? 0) * quantity;
  const taxFee   = Math.round(fee * 0.1);
  const totalFee = fee + taxFee;

  return (
    <div style={{ width:1920, height:1080, display:"flex", flexDirection:"column", background:"var(--ink-8)", position:"relative" }}>
      <TopBar lang={lang} onLangChange={onLangChange} onHome={onHome} onHelp={onHelp}
        title={PHASE_TITLE[phase]} />

      {phase !== "intro" && phase !== "success" && <StepStrip phase={phase}/>}

      <div style={{ flex:1, minHeight:0, position:"relative" }} className="screen-enter" key={phase}>

        {phase === "intro"      && <IntroPhase onStart={onRealStart} onBack={onBack}/>}
        {phase === "qr_wait"    && (
          <QRWaitPhase
            sessionCode={sessionCode}
            qrDataUrl={qrDataUrl}
            qrPayload={qrPayload}
            mobileConnected={mobileConnected}
            showDemoBtn={showDemoBtn}
            sessionError={sessionError}
            onDemoMode={runDemoMode}
            onBack={() => setPhase("intro")}
          />
        )}
        {phase === "uploading"  && <UploadingPhase/>}
        {phase === "processing" && <ProcessingPhase step={procStep} detected={detected}/>}
        {phase === "preview"    && (
          <PreviewPhase
            pages={pages} activePage={activePage} onSelectPage={setActivePage}
            corners={activeCorners} detected={detected}
            previewRef={previewRef} dragging={dragging}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            onReset={() => setActiveCorners(() => [...AI_DETECTED_CORNERS])}
            onConfirm={() => {
              // Crop every page on the backend (best-effort, non-blocking)
              if (requestId) {
                pages.forEach((p, idx) => {
                  copyDocApi.cropPage(requestId, idx, p.corners)
                    .catch(err => console.warn("[CopyDoc] Crop page " + idx + " failed:", err));
                });
              }
              setPhase("qty_fee");
            }}
            onBack={() => setPhase("qr_wait")}
          />
        )}
        {phase === "qty_fee"    && detected && (
          <QtyFeePhase
            detected={detected} quantity={quantity} onQtyChange={setQuantity}
            fee={fee} taxFee={taxFee} totalFee={totalFee}
            onConfirm={() => setPhase("fee_confirm")}
            onBack={() => setPhase("preview")}
          />
        )}
        {phase === "fee_confirm" && detected && (
          <FeeConfirmPhase
            totalFee={totalFee} quantity={quantity} detected={detected}
            onConfirm={() => setPhase("generating")}
            onBack={() => setPhase("qty_fee")}
          />
        )}
        {phase === "generating" && <GeneratingPhase/>}
        {phase === "printing"   && <PrintingPhase/>}
        {phase === "success"    && detected && (
          <SuccessPhase
            receiptCode={receiptCode} detected={detected}
            quantity={quantity} totalFee={totalFee}
            onHome={onHome}
          />
        )}
      </div>
    </div>
  );
}
