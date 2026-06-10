"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { TopBar, Spinner } from "../ui";
import { Icon } from "../icons";

/* ═══ Document categories — mirrors CMS pricing config ══════ */
interface DocCategory {
  id: string; icon: string; label: string; sub: string;
  price: number; color: string; bg: string;
}
const DOC_CATS: DocCategory[] = [
  { id:"hotich",    icon:"hotich",    label:"Hộ tịch",          sub:"Khai sinh, kết hôn, khai tử",    price:15000, color:"var(--blue)",   bg:"var(--blue-lt)"   },
  { id:"cutru",     icon:"cutru",     label:"Cư trú",            sub:"Thường trú, tạm trú, tạm vắng",  price:10000, color:"var(--teal)",   bg:"var(--teal-lt)"   },
  { id:"cccd",      icon:"cccd",      label:"CCCD & Hộ chiếu",  sub:"Căn cước công dân, hộ chiếu",    price:20000, color:"var(--orange)", bg:"var(--orange-lt)" },
  { id:"chungthuc", icon:"chungthuc", label:"Chứng thực",        sub:"Bản sao y, chữ ký, hợp đồng",   price:25000, color:"var(--green)",  bg:"var(--green-lt)"  },
  { id:"datdai",    icon:"datdai",    label:"Đất đai",           sub:"GCN quyền sở hữu, trích lục",   price:30000, color:"var(--purple)", bg:"var(--purple-lt)" },
  { id:"kinhdoanh", icon:"kinhdoanh", label:"Kinh doanh",        sub:"Đăng ký kinh doanh, giấy phép", price:20000, color:"var(--ink-3)",  bg:"var(--ink-8)"     },
];

/* ═══ Friendly processing messages — no technical jargon ════ */
const PROC_MSGS = [
  "Đang nhận tài liệu từ điện thoại của bạn...",
  "Đang kiểm tra chất lượng hình ảnh...",
  "Đang làm rõ nội dung giấy tờ...",
  "Đang xác định loại tài liệu...",
  "Đang hoàn tất và kiểm tra lần cuối...",
];

type Phase =
  | "intro" | "category" | "qr_wait" | "uploading" | "processing"
  | "preview" | "qty_fee" | "fee_confirm" | "generating" | "printing" | "success";

type Corner = { x: number; y: number }; // normalised 0–1 within preview area

const DEFAULT_CORNERS: Corner[] = [
  { x: 0.08, y: 0.07 }, { x: 0.92, y: 0.07 },
  { x: 0.92, y: 0.93 }, { x: 0.08, y: 0.93 },
];

function fmtVND(n: number) { return n.toLocaleString("vi-VN") + " ₫"; }

function mkCode(prefix: string) {
  return prefix + "-2026-" + String(Math.floor(10000 + Math.random() * 90000));
}

/* ═══ Step strip ════════════════════════════════════════════ */
const STEPS: { label: string; phases: Phase[] }[] = [
  { label: "Chọn loại",      phases: ["category"] },
  { label: "Chụp tài liệu", phases: ["qr_wait","uploading","processing"] },
  { label: "Điều chỉnh",    phases: ["preview"] },
  { label: "Xác nhận phí",  phases: ["qty_fee","fee_confirm"] },
  { label: "Tạo bản sao",   phases: ["generating","printing"] },
  { label: "Hoàn tất",      phases: ["success"] },
];

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
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:5, width:140 }}>
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

/* ═══ Decorative QR ═════════════════════════════════════════ */
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

/* ═══ PHASE — Intro ═════════════════════════════════════════ */
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
          <span style={{ fontSize:14, fontWeight:700, color:"var(--teal-dk)" }}>Dịch vụ số hoá tại chỗ</span>
        </div>

        <h1 style={{ fontSize:54, fontWeight:900, color:"var(--ink-0)", lineHeight:1.1, letterSpacing:"-.02em", marginBottom:20 }}>
          Sao y tài liệu<br/>
          <span style={{ color:"var(--blue)" }}>điện tử</span>
        </h1>

        <p style={{ fontSize:19, color:"var(--ink-4)", lineHeight:1.75, maxWidth:520, marginBottom:44 }}>
          Chụp tài liệu bằng điện thoại, hệ thống tự động xử lý và in
          bản sao có giá trị pháp lý ngay tại quầy — không cần công chứng.
        </p>

        {[
          { e:"📱", t:"Chụp bằng camera điện thoại, không cần cài app" },
          { e:"⚡", t:"Xử lý và in trong vòng 3 phút"                  },
          { e:"🔒", t:"Bản sao có mã QR xác thực hợp lệ pháp lý"      },
          { e:"💾", t:"Lưu tự động vào ví giấy tờ số"                  },
        ].map((f,i) => (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:16, marginBottom:14 }}>
            <div style={{
              width:44, height:44, borderRadius:12, background:"var(--blue-lt)",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:20, flexShrink:0,
            }}>{f.e}</div>
            <span style={{ fontSize:17, color:"var(--ink-2)", fontWeight:500 }}>{f.t}</span>
          </div>
        ))}

        <div style={{ display:"flex", gap:16, marginTop:48 }}>
          <button className="btn btn-ghost btn-lg" onClick={onBack} style={{ gap:8 }}>
            <Icon name="back" size={20}/> Quay lại
          </button>
          <button className="btn btn-primary btn-xl" onClick={onStart} style={{ gap:12, paddingRight:52 }}>
            Bắt đầu ngay
            <Icon name="arrow" size={22} style={{ color:"#fff" }}/>
          </button>
        </div>
      </div>

      {/* Right — process flow */}
      <div style={{ width:460, flexShrink:0, display:"flex", flexDirection:"column", gap:16 }}>
        {[
          { n:"01", t:"Chọn loại giấy tờ",      icon:"doc",   col:"var(--blue)"  },
          { n:"02", t:"Chụp bằng điện thoại",   icon:"scan",  col:"var(--teal)"  },
          { n:"03", t:"Hệ thống kiểm tra",       icon:"check", col:"var(--orange)"},
          { n:"04", t:"In và lưu bản sao điện tử",icon:"print",col:"var(--green)" },
        ].map((s,i) => (
          <div key={s.n} style={{
            display:"flex", alignItems:"center", gap:20, padding:"20px 24px",
            background:"#fff", borderRadius:16, border:"1.5px solid var(--ink-7)",
            boxShadow:"var(--shadow-sm)",
            animation:`fadeUp .4s ${i*0.08}s ease both`,
          }}>
            <div style={{
              width:52, height:52, borderRadius:14, background: s.col==="var(--blue)"?"var(--blue-lt)":
                s.col==="var(--teal)"?"var(--teal-lt)":
                s.col==="var(--orange)"?"var(--orange-lt)":"var(--green-lt)",
              display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
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

/* ═══ PHASE — Category selection ════════════════════════════ */
function CategoryPhase({ onSelect, onBack }: { onSelect(c:DocCategory):void; onBack():void }) {
  const [hov, setHov] = useState<string|null>(null);
  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", padding:"20px 48px 28px" }}>
      <div style={{ marginBottom:16 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ gap:6 }}>
          <Icon name="back" size={16}/> Quay lại
        </button>
      </div>
      <div style={{ marginBottom:22 }}>
        <h2 style={{ fontSize:30, fontWeight:800, color:"var(--ink-0)" }}>Chọn loại giấy tờ cần sao y</h2>
        <p style={{ fontSize:15, color:"var(--ink-4)", marginTop:5 }}>Mức phí theo cấu hình từ hệ thống. Giá chưa bao gồm thuế.</p>
      </div>
      <div style={{ flex:1, display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:20 }}>
        {DOC_CATS.map(cat => {
          const h = hov === cat.id;
          return (
            <button key={cat.id}
              onPointerEnter={() => setHov(cat.id)}
              onPointerLeave={() => setHov(null)}
              onClick={() => onSelect(cat)}
              style={{
                display:"flex", flexDirection:"column", alignItems:"flex-start",
                padding:"28px 28px 22px", borderRadius:20, cursor:"pointer", textAlign:"left",
                background: h ? cat.bg : "#fff",
                border:`2px solid ${h ? cat.color : "var(--ink-7)"}`,
                boxShadow: h ? "var(--shadow-lg)" : "var(--shadow-sm)",
                transform: h ? "translateY(-4px)" : "none",
                transition:"all .2s cubic-bezier(0.34,1.56,0.64,1)",
              }}
            >
              <div style={{
                width:60, height:60, borderRadius:16, background:cat.bg,
                display:"flex", alignItems:"center", justifyContent:"center",
                marginBottom:16, border:`2px solid ${h ? cat.color : "transparent"}`,
                transition:"border-color .2s",
              }}>
                <Icon name={cat.icon as Parameters<typeof Icon>[0]["name"]} size={30} style={{ color:cat.color }}/>
              </div>
              <div style={{ fontSize:20, fontWeight:800, color:"var(--ink-0)", marginBottom:5 }}>{cat.label}</div>
              <div style={{ fontSize:13, color:"var(--ink-4)", marginBottom:18, lineHeight:1.5 }}>{cat.sub}</div>
              <div style={{
                marginTop:"auto", display:"flex", alignItems:"baseline", gap:5,
                padding:"8px 16px", borderRadius:10,
                background: h ? "rgba(255,255,255,.65)" : "var(--ink-8)",
                transition:"background .2s",
              }}>
                <span style={{ fontSize:22, fontWeight:900, color:cat.color }}>{fmtVND(cat.price)}</span>
                <span style={{ fontSize:13, color:"var(--ink-4)", fontWeight:500 }}>/bản sao</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══ PHASE — QR Wait ═══════════════════════════════════════ */
function QRWaitPhase({ sessionCode, onBack }: { sessionCode:string; onBack():void }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t+1), 1500);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ height:"100%", display:"flex", padding:"24px 80px", alignItems:"center", gap:80 }}>
      {/* Instructions */}
      <div style={{ flex:1 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ gap:6, marginBottom:28 }}>
          <Icon name="back" size={16}/> Quay lại
        </button>
        <h2 style={{ fontSize:36, fontWeight:800, color:"var(--ink-0)", marginBottom:16, lineHeight:1.2 }}>
          Dùng điện thoại để<br/>chụp tài liệu
        </h2>
        <p style={{ fontSize:18, color:"var(--ink-4)", marginBottom:36, lineHeight:1.7 }}>
          Mở camera điện thoại và quét mã QR bên cạnh.<br/>
          <strong style={{ color:"var(--blue)" }}>Không cần cài ứng dụng</strong> — trình duyệt web là đủ.
        </p>

        {[
          { n:"1", t:"Mở camera hoặc ứng dụng quét QR trên điện thoại"    },
          { n:"2", t:"Quét mã QR và nhấn vào đường link xuất hiện"         },
          { n:"3", t:"Làm theo hướng dẫn để chụp tài liệu"                 },
          { n:"4", t:"Hệ thống tự động nhận ảnh — không cần nhấn thêm gì" },
        ].map(s => (
          <div key={s.n} style={{ display:"flex", gap:16, alignItems:"flex-start", marginBottom:20 }}>
            <div style={{
              width:36, height:36, borderRadius:"50%", background:"var(--blue)",
              display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
            }}>
              <span style={{ fontSize:16, fontWeight:800, color:"#fff" }}>{s.n}</span>
            </div>
            <div style={{ paddingTop:6, fontSize:17, color:"var(--ink-2)", lineHeight:1.5 }}>{s.t}</div>
          </div>
        ))}
      </div>

      {/* QR card */}
      <div style={{
        width:460, flexShrink:0, background:"#fff", borderRadius:28,
        border:"2px solid var(--ink-7)", boxShadow:"var(--shadow-xl)",
        padding:"40px 36px", display:"flex", flexDirection:"column", alignItems:"center",
      }}>
        <div style={{ position:"relative", marginBottom:28 }}>
          {/* Pulse ring */}
          <div style={{
            position:"absolute", inset:-18, borderRadius:24,
            border:"3px solid var(--blue)",
            opacity: tick%2===0 ? 0.15 : 0.35,
            transform: tick%2===0 ? "scale(1)" : "scale(1.05)",
            transition:"all 1.5s ease",
            pointerEvents:"none",
          }}/>
          <FakeQR size={220}/>
        </div>

        <div style={{
          background:"var(--ink-8)", borderRadius:12, padding:"12px 24px",
          marginBottom:20, textAlign:"center", width:"100%",
        }}>
          <div style={{ fontSize:11, color:"var(--ink-4)", fontWeight:700, letterSpacing:".08em", marginBottom:5 }}>MÃ PHIÊN LÀM VIỆC</div>
          <div style={{ fontSize:26, fontWeight:900, color:"var(--ink-0)", letterSpacing:".18em", fontVariantNumeric:"tabular-nums" }}>{sessionCode}</div>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background:"var(--green)", animation:"blink 1.5s infinite" }}/>
          <span style={{ fontSize:15, color:"var(--green)", fontWeight:600 }}>Đang chờ kết nối từ điện thoại...</span>
        </div>
        <div style={{ fontSize:13, color:"var(--ink-5)", textAlign:"center" }}>
          Mã QR hết hạn sau&nbsp;
          <strong style={{ color:"var(--orange)" }}>5:00</strong> phút
        </div>
      </div>
    </div>
  );
}

/* ═══ PHASE — Uploading ═════════════════════════════════════ */
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
        <h2 style={{ fontSize:30, fontWeight:800, color:"var(--ink-0)", marginBottom:10 }}>Đã kết nối điện thoại!</h2>
        <p style={{ fontSize:17, color:"var(--ink-4)" }}>Đang nhận tài liệu từ điện thoại của bạn...</p>
      </div>
      {/* Progress bars */}
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

/* ═══ PHASE — Processing ════════════════════════════════════ */
function ProcessingPhase({ step }: { step:number }) {
  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:40 }}>
      {/* Animated icon */}
      <div style={{ position:"relative", width:140, height:140 }}>
        <div style={{
          position:"absolute", inset:0, borderRadius:"50%",
          background:"var(--blue-lt)", display:"flex", alignItems:"center", justifyContent:"center",
        }}>
          <Icon name="doc" size={60} style={{ color:"var(--blue)" }}/>
        </div>
        {/* Spinning ring */}
        <svg style={{ position:"absolute", inset:0, animation:"spin 2s linear infinite" }}
          viewBox="0 0 140 140" width={140} height={140}>
          <circle cx={70} cy={70} r={65} fill="none" stroke="var(--blue)" strokeWidth={3}
            strokeDasharray="100 310" strokeLinecap="round"/>
        </svg>
      </div>

      <div style={{ textAlign:"center", maxWidth:580 }}>
        <h2 style={{ fontSize:34, fontWeight:800, color:"var(--ink-0)", marginBottom:18 }}>
          Hệ thống đang kiểm tra giấy tờ
        </h2>
        <p style={{ fontSize:20, color:"var(--blue)", fontWeight:600, minHeight:32, transition:"opacity .3s" }}>
          {PROC_MSGS[step]}
        </p>
      </div>

      {/* Progress dots */}
      <div style={{ display:"flex", gap:8 }}>
        {PROC_MSGS.map((_,i) => (
          <div key={i} style={{
            width: i===step ? 28 : 8, height:8, borderRadius:999,
            background: i<=step ? "var(--blue)" : "var(--ink-6)",
            transition:"all .3s ease",
          }}/>
        ))}
      </div>

      <p style={{ fontSize:15, color:"var(--ink-5)", textAlign:"center", lineHeight:1.65, maxWidth:400 }}>
        Vui lòng không chạm màn hình.<br/>Quá trình này thường mất dưới 30 giây.
      </p>
    </div>
  );
}

/* ═══ PHASE — Preview / Four-corner editor ══════════════════ */
const PW = 640, PH = 400; // preview canvas size

function CornerHandle({
  cx, cy, isDragging, onDown,
}: {
  cx:number; cy:number; isDragging:boolean;
  onDown(e:React.PointerEvent):void;
}) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={26} fill="rgba(0,104,183,.12)"/>
      <circle cx={cx} cy={cy} r={14}
        fill={isDragging ? "var(--blue)" : "#fff"}
        stroke="var(--blue)" strokeWidth={3}
        style={{ cursor:"grab", touchAction:"none" }}
        onPointerDown={onDown}/>
      <line x1={cx-7} y1={cy} x2={cx+7} y2={cy}
        stroke={isDragging?"#fff":"var(--blue)"} strokeWidth={2}/>
      <line x1={cx} y1={cy-7} x2={cx} y2={cy+7}
        stroke={isDragging?"#fff":"var(--blue)"} strokeWidth={2}/>
    </g>
  );
}

function PreviewPhase({
  corners, previewRef, dragging,
  onPointerDown, onPointerMove, onPointerUp,
  onReset, onConfirm, onBack,
}: {
  corners:Corner[]; previewRef:React.RefObject<HTMLDivElement|null>;
  dragging:number|null;
  onPointerDown(e:React.PointerEvent,idx:number):void;
  onPointerMove(e:React.PointerEvent):void;
  onPointerUp():void;
  onReset():void; onConfirm():void; onBack():void;
}) {
  return (
    <div style={{ height:"100%", display:"flex", padding:"16px 48px 20px", gap:40, alignItems:"center" }}>
      {/* Left panel */}
      <div style={{ width:320, flexShrink:0, display:"flex", flexDirection:"column", gap:18 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ gap:6, width:"fit-content" }}>
          <Icon name="back" size={16}/> Quay lại
        </button>
        <div>
          <h2 style={{ fontSize:24, fontWeight:800, color:"var(--ink-0)", marginBottom:8 }}>Kiểm tra vùng tài liệu</h2>
          <p style={{ fontSize:14, color:"var(--ink-4)", lineHeight:1.65 }}>
            Kéo 4 góc màu xanh để căn chỉnh đúng mép tài liệu.
            Nhấn <strong>Xác nhận</strong> khi căn chỉnh xong.
          </p>
        </div>

        <div style={{ background:"var(--blue-lt)", borderRadius:14, padding:"14px 16px" }}>
          {[
            "Đặt 4 góc chạm chính xác mép của giấy tờ",
            "Đảm bảo toàn bộ nội dung nằm trong vùng chọn",
            "Bấm Đặt lại nếu muốn về vị trí mặc định",
          ].map(tip => (
            <div key={tip} style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:10 }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:"var(--blue)", marginTop:7, flexShrink:0 }}/>
              <span style={{ fontSize:13, color:"var(--blue-dk)", lineHeight:1.5 }}>{tip}</span>
            </div>
          ))}
        </div>

        {/* Tool buttons */}
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn btn-ghost btn-sm" onClick={onReset} style={{ flex:1, gap:6, fontSize:14 }}>
            ↺ Đặt lại
          </button>
        </div>

        <div style={{ flex:1 }}/>
        <button className="btn btn-primary btn-lg" onClick={onConfirm} style={{ gap:10 }}>
          Xác nhận vùng này
          <Icon name="arrow" size={20} style={{ color:"#fff" }}/>
        </button>
      </div>

      {/* Centre — preview with corner editor */}
      <div style={{ flex:1, display:"flex", justifyContent:"center", alignItems:"center", flexDirection:"column", gap:16 }}>
        <div
          ref={previewRef}
          style={{
            position:"relative", width:PW, height:PH, borderRadius:16,
            overflow:"hidden", boxShadow:"var(--shadow-xl)",
            cursor: dragging!==null ? "grabbing":"default",
            userSelect:"none", flexShrink:0,
          }}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* Simulated document page */}
          <div style={{
            position:"absolute", inset:0,
            background:"linear-gradient(145deg,#f0ebdf,#e8e2d4)",
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            <div style={{
              width:"74%", height:"78%", background:"#fff", borderRadius:4,
              boxShadow:"0 6px 24px rgba(0,0,0,.22)", padding:"18px 22px",
              display:"flex", flexDirection:"column", gap:8,
            }}>
              <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:6 }}>
                <div style={{ width:28,height:28,borderRadius:"50%",background:"var(--blue-lt)",flexShrink:0 }}/>
                <div>
                  <div style={{ width:110,height:7,background:"var(--ink-6)",borderRadius:4 }}/>
                  <div style={{ width:70,height:5,background:"var(--ink-8)",borderRadius:4,marginTop:5 }}/>
                </div>
              </div>
              {[150,200,130,180,110,190,120,160].map((w,i) => (
                <div key={i} style={{ width:`${w}px`,height:6,background:i%2===0?"var(--ink-7)":"var(--ink-8)",borderRadius:4 }}/>
              ))}
              <div style={{ display:"flex",gap:8,marginTop:8 }}>
                <div style={{ width:72,height:72,background:"var(--ink-8)",borderRadius:4,flexShrink:0 }}/>
                <div style={{ flex:1,display:"flex",flexDirection:"column",gap:5 }}>
                  {[80,100,60,90].map((w,i) => <div key={i} style={{ width:`${w}px`,height:6,background:"var(--ink-7)",borderRadius:4 }}/>)}
                </div>
              </div>
            </div>
          </div>

          {/* Dimming mask outside selection */}
          <svg style={{ position:"absolute",inset:0,pointerEvents:"none" }} width={PW} height={PH}>
            <defs>
              <mask id="cpmask">
                <rect width={PW} height={PH} fill="white"/>
                <polygon points={corners.map(c=>`${c.x*PW},${c.y*PH}`).join(" ")} fill="black"/>
              </mask>
            </defs>
            <rect width={PW} height={PH} fill="rgba(15,23,42,.52)" mask="url(#cpmask)"/>
          </svg>

          {/* Overlay SVG — edges + handles */}
          <svg style={{ position:"absolute",inset:0 }} width={PW} height={PH} viewBox={`0 0 ${PW} ${PH}`}>
            <polygon
              points={corners.map(c=>`${c.x*PW},${c.y*PH}`).join(" ")}
              fill="none" stroke="rgba(0,104,183,.7)" strokeWidth={2} strokeDasharray="10 5"
            />
            {corners.map((c,idx) => (
              <CornerHandle key={idx}
                cx={c.x*PW} cy={c.y*PH}
                isDragging={dragging===idx}
                onDown={e => onPointerDown(e, idx)}
              />
            ))}
          </svg>
        </div>
        <p style={{ fontSize:13, color:"var(--ink-5)" }}>Kéo các góc màu xanh để căn vùng cắt</p>
      </div>

      {/* Right — rotate/zoom tools */}
      <div style={{ width:76, flexShrink:0, display:"flex", flexDirection:"column", gap:10, alignItems:"center" }}>
        {[{ l:"+", tip:"Phóng to" },{ l:"−", tip:"Thu nhỏ" },{ l:"↺", tip:"Xoay trái" },{ l:"↻", tip:"Xoay phải" }].map(t => (
          <button key={t.l} title={t.tip} style={{
            width:64, height:64, borderRadius:16,
            background:"#fff", border:"2px solid var(--ink-7)",
            fontSize:24, color:"var(--ink-2)", cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:"var(--shadow-sm)", transition:"border-color .15s",
          }}
            onPointerEnter={e => (e.currentTarget.style.borderColor="var(--blue)")}
            onPointerLeave={e => (e.currentTarget.style.borderColor="var(--ink-7)")}
          >{t.l}</button>
        ))}
      </div>
    </div>
  );
}

/* ═══ PHASE — Quantity + Fee ════════════════════════════════ */
function QtyFeePhase({
  category, quantity, onQtyChange,
  fee, taxFee, totalFee, onConfirm, onBack,
}: {
  category:DocCategory; quantity:number;
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

        {/* Validated type badge */}
        <div style={{
          display:"flex", alignItems:"center", gap:16, padding:"18px 22px",
          background:"var(--teal-lt)", borderRadius:16,
          border:"2px solid var(--teal)", marginBottom:36,
        }}>
          <div style={{
            width:52, height:52, borderRadius:14, background:"var(--teal)",
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            <Icon name={category.icon as Parameters<typeof Icon>[0]["name"]} size={26} style={{ color:"#fff" }}/>
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--teal-dk)", letterSpacing:".06em", marginBottom:3 }}>
              LOẠI GIẤY TỜ ĐÃ XÁC NHẬN
            </div>
            <div style={{ fontSize:20, fontWeight:800, color:"var(--ink-0)" }}>
              {category.label}
            </div>
          </div>
          <button style={{
            marginLeft:"auto", padding:"8px 16px", borderRadius:8,
            border:"2px solid var(--teal)", background:"transparent",
            color:"var(--teal-dk)", fontSize:14, fontWeight:600, cursor:"pointer",
          }}>Đổi loại</button>
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
            width:120, height:68, borderRadius:16, background:"var(--blue-lt)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:40, fontWeight:900, color:"var(--blue)",
          }}>{quantity}</div>

          <button onClick={() => onQtyChange(Math.min(10, quantity+1))} style={{
            width:68, height:68, borderRadius:16, border:"2px solid var(--blue)",
            background:"var(--blue)", fontSize:32, color:"#fff", cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center",
            transition:"background .15s",
          }}>+</button>
          <span style={{ fontSize:15, color:"var(--ink-4)", fontWeight:500 }}>bản sao (tối đa 10)</span>
        </div>
      </div>

      {/* Right — Fee card */}
      <div style={{ width:440, flexShrink:0 }}>
        <div style={{ background:"#fff", borderRadius:24, border:"1.5px solid var(--ink-7)", boxShadow:"var(--shadow-xl)", overflow:"hidden" }}>
          {/* Header */}
          <div style={{ background:"var(--blue)", padding:"24px 28px" }}>
            <div style={{ fontSize:13, color:"rgba(255,255,255,.7)", fontWeight:600, marginBottom:4 }}>TỔNG PHÍ DỰ TÍNH</div>
            <div style={{ fontSize:48, fontWeight:900, color:"#fff", letterSpacing:"-.02em" }}>{fmtVND(totalFee)}</div>
          </div>
          {/* Breakdown */}
          <div style={{ padding:"22px 28px" }}>
            {[
              { l:"Phí sao y",              v: fmtVND(fee)    },
              { l:`${quantity} bản × ${fmtVND(category.price)}/bản`, v:"" },
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
              <span style={{ fontSize:20, fontWeight:900, color:"var(--blue)" }}>{fmtVND(totalFee)}</span>
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

/* ═══ PHASE — Fee confirm ═══════════════════════════════════ */
function FeeConfirmPhase({
  totalFee, quantity, category, onConfirm, onBack,
}: {
  totalFee:number; quantity:number; category:DocCategory;
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
          tài liệu loại <strong style={{ color:"var(--ink-0)" }}>{category.label}</strong>.
        </p>

        <div style={{
          background:"var(--ink-8)", borderRadius:16, padding:"22px 30px",
          display:"flex", justifyContent:"space-between", alignItems:"center",
          marginBottom:32, border:"2px solid var(--ink-7)",
        }}>
          <div style={{ textAlign:"left" }}>
            <div style={{ fontSize:13, color:"var(--ink-4)", marginBottom:4 }}>Tổng số tiền thanh toán</div>
            <div style={{ fontSize:42, fontWeight:900, color:"var(--blue)" }}>{fmtVND(totalFee)}</div>
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

/* ═══ PHASE — Generating PDF ════════════════════════════════ */
function GeneratingPhase() {
  const steps = [
    { t:"Áp dụng hiệu chỉnh góc nhìn tài liệu",  done:true  },
    { t:"Tạo PDF có mã QR xác thực pháp lý",      done:true  },
    { t:"Ký số và đóng dấu thời gian",             done:false },
    { t:"Gửi lệnh in tới máy in tại quầy",         done:false },
  ];
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
          <div key={s.t} style={{ display:"flex", gap:14, alignItems:"center", opacity: i<=1 ? 1 : 0.35 }}>
            <div style={{
              width:26, height:26, borderRadius:"50%", flexShrink:0,
              background: s.done ? "var(--green)" : "var(--ink-6)",
              display:"flex", alignItems:"center", justifyContent:"center",
              transition:`background .3s ${i*0.2}s`,
            }}>
              {s.done
                ? <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="#fff" strokeWidth={2.5}><polyline points="20 6 9 17 4 12"/></svg>
                : <div style={{ width:8, height:8, borderRadius:"50%", background:"#fff" }}/>
              }
            </div>
            <span style={{ fontSize:16, color: s.done?"var(--ink-1)":"var(--ink-5)", fontWeight: s.done?600:400 }}>{s.t}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══ PHASE — Printing ══════════════════════════════════════ */
function PrintingPhase() {
  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:36 }}>
      {/* Printer illustration */}
      <div style={{
        width:220, height:160, borderRadius:20, background:"var(--ink-0)",
        position:"relative", overflow:"visible",
        boxShadow:"0 20px 60px rgba(15,23,42,.35)",
        display:"flex", alignItems:"flex-end", justifyContent:"center",
        padding:"0 0 20px",
      }}>
        {/* Status light */}
        <div style={{ position:"absolute", top:18, right:22, width:10, height:10, borderRadius:"50%", background:"var(--green)", animation:"blink 1s infinite" }}/>
        {/* Paper feed slot */}
        <div style={{ position:"absolute", top:36, left:"50%", transform:"translateX(-50%)", width:140, height:7, background:"var(--ink-2)", borderRadius:4 }}/>
        {/* Paper coming out */}
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

/* ═══ PHASE — Success ═══════════════════════════════════════ */
function SuccessPhase({
  receiptCode, category, quantity, totalFee, onHome,
}: {
  receiptCode:string; category:DocCategory;
  quantity:number; totalFee:number; onHome():void;
}) {
  return (
    <div style={{ height:"100%", display:"flex", padding:"24px 80px", gap:60, alignItems:"center" }}>
      {/* Left */}
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
          <strong style={{ color:"var(--ink-1)" }}>{category.label}</strong> đã in thành công.
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

      {/* Right — receipt card */}
      <div style={{ width:480, flexShrink:0, animation:"pop .5s .15s cubic-bezier(0.34,1.56,0.64,1) both" }}>
        <div style={{
          background:"#fff", borderRadius:24, overflow:"hidden",
          boxShadow:"var(--shadow-xl)", border:"1.5px solid var(--ink-7)",
        }}>
          {/* Header */}
          <div style={{ background:"var(--green)", padding:"22px 28px", color:"#fff" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
              <Icon name="check" size={22} style={{ color:"#fff" }}/>
              <span style={{ fontSize:15, fontWeight:700 }}>PHIẾU SAO Y ĐIỆN TỬ</span>
            </div>
            <div style={{ fontSize:13, opacity:.85 }}>UBND Phường Cửa Nam · Hà Nội</div>
          </div>

          {/* QR + code */}
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

            {/* Details */}
            {[
              { l:"Loại giấy tờ",    v: category.label },
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

/* ═══ Root screen component ═════════════════════════════════ */
interface Props {
  lang: "vi" | "en";
  onLangChange: (l: "vi" | "en") => void;
  onBack: () => void;
  onHome: () => void;
  onHelp: () => void;
}

const PHASE_TITLE: Record<Phase, string> = {
  intro:       "Sao y tài liệu điện tử",
  category:    "Chọn loại giấy tờ",
  qr_wait:     "Quét mã để chụp tài liệu",
  uploading:   "Đang nhận tài liệu",
  processing:  "Đang kiểm tra giấy tờ",
  preview:     "Kiểm tra & điều chỉnh vùng",
  qty_fee:     "Số lượng & Phí dịch vụ",
  fee_confirm: "Xác nhận thanh toán",
  generating:  "Đang tạo bản sao điện tử",
  printing:    "Đang in tài liệu",
  success:     "Sao y hoàn tất",
};

export function CopyDocScreen({ lang, onLangChange, onBack, onHome, onHelp }: Props) {
  const [phase, setPhase]       = useState<Phase>("intro");
  const [category, setCategory] = useState<DocCategory | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [procStep, setProcStep] = useState(0);
  const [corners, setCorners]   = useState<Corner[]>([...DEFAULT_CORNERS]);
  const [dragging, setDragging] = useState<number | null>(null);
  const previewRef              = useRef<HTMLDivElement>(null);

  // Lazy-init codes so they don't change on re-render
  const [sessionCode] = useState(() => mkCode("SQ"));
  const [receiptCode] = useState(() => mkCode("SY"));

  /* Processing message rotation */
  useEffect(() => {
    if (phase !== "processing") return;
    const id = setInterval(() => setProcStep(s => Math.min(s + 1, PROC_MSGS.length - 1)), 900);
    return () => clearInterval(id);
  }, [phase]);

  /* Demo auto-advance timers */
  useEffect(() => {
    const map: Partial<Record<Phase, [Phase, number]>> = {
      qr_wait:    ["uploading",  7000],
      uploading:  ["processing", 2200],
      processing: ["preview",    4800],
      generating: ["printing",   3000],
      printing:   ["success",    3500],
    };
    const entry = map[phase];
    if (!entry) return;
    const [next, ms] = entry;
    if (phase === "uploading") setProcStep(0);
    const t = setTimeout(() => setPhase(next), ms);
    return () => clearTimeout(t);
  }, [phase]);

  /* Corner drag — pointer capture on the SVG handles */
  const onPointerDown = useCallback((e: React.PointerEvent, idx: number) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(idx);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (dragging === null || !previewRef.current) return;
    const r = previewRef.current.getBoundingClientRect();
    setCorners(prev => prev.map((c, i) => i !== dragging ? c : {
      x: Math.max(0, Math.min(1, (e.clientX - r.left)  / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    }));
  }, [dragging]);

  const onPointerUp = useCallback(() => setDragging(null), []);

  const fee      = (category?.price ?? 0) * quantity;
  const taxFee   = Math.round(fee * 0.1);
  const totalFee = fee + taxFee;

  return (
    <div style={{ width:1920, height:1080, display:"flex", flexDirection:"column", background:"var(--ink-8)" }}>
      <TopBar lang={lang} onLangChange={onLangChange} onHome={onHome} onHelp={onHelp}
        title={PHASE_TITLE[phase]} />

      {phase !== "intro" && phase !== "success" && <StepStrip phase={phase}/>}

      <div style={{ flex:1, minHeight:0 }} className="screen-enter" key={phase}>
        {phase === "intro"       && <IntroPhase onStart={() => setPhase("category")} onBack={onBack}/>}
        {phase === "category"    && <CategoryPhase onSelect={cat => { setCategory(cat); setPhase("qr_wait"); }} onBack={() => setPhase("intro")}/>}
        {phase === "qr_wait"     && <QRWaitPhase sessionCode={sessionCode} onBack={() => setPhase("category")}/>}
        {phase === "uploading"   && <UploadingPhase/>}
        {phase === "processing"  && <ProcessingPhase step={procStep}/>}
        {phase === "preview"     && (
          <PreviewPhase
            corners={corners} previewRef={previewRef} dragging={dragging}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            onReset={() => setCorners([...DEFAULT_CORNERS])}
            onConfirm={() => setPhase("qty_fee")} onBack={() => setPhase("qr_wait")}
          />
        )}
        {phase === "qty_fee"     && (
          <QtyFeePhase
            category={category!} quantity={quantity} onQtyChange={setQuantity}
            fee={fee} taxFee={taxFee} totalFee={totalFee}
            onConfirm={() => setPhase("fee_confirm")} onBack={() => setPhase("preview")}
          />
        )}
        {phase === "fee_confirm" && (
          <FeeConfirmPhase totalFee={totalFee} quantity={quantity} category={category!}
            onConfirm={() => setPhase("generating")} onBack={() => setPhase("qty_fee")}/>
        )}
        {phase === "generating"  && <GeneratingPhase/>}
        {phase === "printing"    && <PrintingPhase/>}
        {phase === "success"     && (
          <SuccessPhase receiptCode={receiptCode} category={category!}
            quantity={quantity} totalFee={totalFee} onHome={onHome}/>
        )}
      </div>
    </div>
  );
}
