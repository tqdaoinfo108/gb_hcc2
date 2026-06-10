"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { TopBar } from "../ui";
import { Icon } from "../icons";
import { seleniumApi } from "../../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  lang: "vi" | "en";
  onLangChange: (l: "vi" | "en") => void;
  onHome: () => void;
  onHelp: () => void;
  onComplete: (result: SubmitResult) => void;
  sessionId?: string;
  deviceSerial?: string;
  templateId?: string;
  procedureName?: string;
  jobId?: string;
  citizenData?: Record<string, string>;
}

export interface SubmitResult {
  success: boolean;
  applicationCode?: string;
  failReason?: string;
}

type StepStatus = "done" | "active" | "pending" | "error";
type InteractionType = "CONFIRM_DATA" | "OTP_SMS" | "VNEID_QR" | "CAPTCHA_WAIT";

interface DemoStep {
  id: string;
  label: string;
  citizenMsg: string;
  portalAction: string;
  durationMs: number;
  interaction?: InteractionType;
}

const DEMO_STEPS: DemoStep[] = [
  { id: "connect",  label: "Kết nối cổng DVC",       citizenMsg: "Đang kết nối cổng dịch vụ công...",         portalAction: "Đang tải trang...",               durationMs: 2400 },
  { id: "auth",     label: "Đăng nhập hệ thống",      citizenMsg: "Đang xác thực thông tin của bạn...",         portalAction: "Đang đăng nhập VNeID...",          durationMs: 3200 },
  { id: "navigate", label: "Chọn thủ tục",            citizenMsg: "Đang tìm đúng biểu mẫu cho thủ tục...",      portalAction: "Điều hướng đến biểu mẫu...",       durationMs: 2000 },
  { id: "fill",     label: "Điền thông tin công dân", citizenMsg: "Đang điền thông tin từ CCCD của bạn...",      portalAction: "Đang nhập thông tin cá nhân...",   durationMs: 4800 },
  { id: "upload",   label: "Đính kèm hồ sơ",          citizenMsg: "Đang tải tài liệu lên hệ thống...",          portalAction: "Đang đính kèm file...",            durationMs: 3600 },
  { id: "confirm",  label: "Xác nhận thông tin",      citizenMsg: "Vui lòng kiểm tra lại thông tin trước khi gửi", portalAction: "Chờ xác nhận...",             durationMs: 0,    interaction: "CONFIRM_DATA" },
  { id: "submit",   label: "Gửi hồ sơ",               citizenMsg: "Đang gửi hồ sơ đến cơ quan tiếp nhận...",    portalAction: "Đang nộp hồ sơ...",               durationMs: 2800 },
  { id: "receipt",  label: "Nhận biên lai",            citizenMsg: "Đang tạo mã biên nhận và theo dõi...",       portalAction: "Đang xuất biên lai...",            durationMs: 1800 },
];

const DEFAULT_CITIZEN: Record<string, string> = {
  "Họ và tên":       "Nguyễn Thị Lan Anh",
  "Ngày sinh":       "12/08/1988",
  "Giới tính":       "Nữ",
  "Số CCCD":         "079088012345",
  "Địa chỉ":         "Số 47, Ngõ 62, Phố Nguyễn Chí Thanh, Đống Đa, Hà Nội",
  "Điện thoại":      "0912 345 678",
  "Email":           "lan.anh@gmail.com",
};

function genCode() {
  const year = new Date().getFullYear();
  const seq = Math.floor(10000 + Math.random() * 89999);
  return `BN-${year}-${seq}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner({ size = 20, color = "var(--blue)" }: { size?: number; color?: string }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", border: `${Math.max(2, size / 8)}px solid ${color}30`, borderTopColor: color, animation: "spin .8s linear infinite", flexShrink: 0 }} />
  );
}

function StepBullet({ status }: { status: StepStatus }) {
  const base: React.CSSProperties = { width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };
  if (status === "done") return (
    <div style={{ ...base, background: "var(--green)" }}>
      <Icon name="check" size={18} style={{ color: "#fff" }} />
    </div>
  );
  if (status === "active") return (
    <div style={{ ...base, background: "var(--blue)", boxShadow: "0 0 0 6px rgba(0,104,183,.18)" }}>
      <Spinner size={16} color="#fff" />
    </div>
  );
  if (status === "error") return (
    <div style={{ ...base, background: "var(--red)" }}>
      <Icon name="x" size={18} style={{ color: "#fff" }} />
    </div>
  );
  return (
    <div style={{ ...base, background: "var(--ink-8)", border: "2px solid var(--ink-6)" }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--ink-5)" }} />
    </div>
  );
}

// ─── Overlays ─────────────────────────────────────────────────────────────────

function OverlayWrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,.76)", zIndex: 40, display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn .2s ease both" }}>
      {children}
    </div>
  );
}

function ConfirmDataOverlay({ data, onConfirm, onCancel }: { data: Record<string, string>; onConfirm: () => void; onCancel: () => void }) {
  return (
    <OverlayWrap>
      <div className="card" style={{ width: 740, maxHeight: 740, display: "flex", flexDirection: "column", borderRadius: 28, overflow: "hidden" }}>
        <div style={{ padding: "32px 40px 24px", borderBottom: "1.5px solid var(--ink-7)", display: "flex", gap: 16, alignItems: "flex-start" }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--blue-lt)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon name="shield" size={24} style={{ color: "var(--blue)" }} />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink-0)" }}>Xác nhận thông tin nộp hồ sơ</div>
            <div style={{ fontSize: 14, color: "var(--ink-4)", marginTop: 4 }}>
              Hệ thống đã tự động điền từ CCCD. Vui lòng kiểm tra lại trước khi gửi.
            </div>
          </div>
        </div>

        <div style={{ padding: "24px 40px", overflowY: "auto", flex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 32px" }}>
            {Object.entries(data).map(([k, v]) => (
              <div key={k} style={{ padding: "14px 0", borderBottom: "1px solid var(--ink-7)" }}>
                <div style={{ fontSize: 12, color: "var(--ink-4)", marginBottom: 4 }}>{k}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink-0)" }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 20, padding: "14px 18px", borderRadius: 12, background: "var(--blue-lt)", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Icon name="info" size={18} style={{ color: "var(--blue)", marginTop: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "var(--blue-dk)", lineHeight: 1.6 }}>
              Nếu có sai sót, nhấn <b>Không đúng</b> và liên hệ nhân viên để chỉnh sửa.
            </span>
          </div>
        </div>

        <div style={{ padding: "24px 40px", borderTop: "1.5px solid var(--ink-7)", display: "flex", gap: 14 }}>
          <button className="btn btn-ghost btn-lg" onClick={onCancel} style={{ flex: 1 }}>
            <Icon name="x" size={18} /> Không đúng
          </button>
          <button className="btn btn-primary btn-lg" onClick={onConfirm} style={{ flex: 2 }}>
            <Icon name="check" size={20} /> Thông tin đúng — Tiếp tục gửi
          </button>
        </div>
      </div>
    </OverlayWrap>
  );
}

function OtpOverlay({ onSubmit, onCancel }: { onSubmit: (otp: string) => void; onCancel: () => void }) {
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const otp = digits.join("");
  const press = (d: string) => {
    const idx = digits.findIndex(x => x === "");
    if (idx === -1) return;
    setDigits(prev => { const n = [...prev]; n[idx] = d; return n; });
  };
  const del = () => {
    const filled = digits.map((d, i) => d ? i : -1).filter(i => i >= 0);
    if (!filled.length) return;
    setDigits(prev => { const n = [...prev]; n[filled[filled.length - 1]] = ""; return n; });
  };

  return (
    <OverlayWrap>
      <div className="card" style={{ width: 520, borderRadius: 28, padding: "40px 44px", display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--blue-lt)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <Icon name="phone" size={26} style={{ color: "var(--blue)" }} />
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink-0)" }}>Nhập mã OTP</div>
          <div style={{ fontSize: 14, color: "var(--ink-4)", marginTop: 6, lineHeight: 1.5 }}>
            Mã xác thực 6 chữ số đã gửi đến<br/>số điện thoại liên kết với CCCD
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {digits.map((d, i) => (
            <div key={i} style={{
              width: 58, height: 70, borderRadius: 12,
              border: `2.5px solid ${d ? "var(--blue)" : "var(--ink-6)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 32, fontWeight: 800, color: "var(--ink-0)",
              background: d ? "var(--blue-lt)" : "#fff",
              transition: "all .15s",
            }}>
              {d || <span style={{ opacity: .2, fontSize: 16 }}>—</span>}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, width: "100%" }}>
          {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => (
            <button key={i} onClick={() => k === "⌫" ? del() : k ? press(k) : undefined} disabled={!k}
              style={{
                height: 70, borderRadius: 14, fontSize: k === "⌫" ? 22 : 26, fontWeight: 700,
                background: !k ? "transparent" : k === "⌫" ? "var(--orange-lt)" : "#fff",
                color: k === "⌫" ? "var(--orange-dk)" : "var(--ink-1)",
                border: k && k !== "⌫" ? "1.5px solid var(--ink-7)" : "none",
                cursor: k ? "pointer" : "default",
                boxShadow: k && k !== "⌫" ? "var(--shadow-sm)" : "none",
              }}>
              {k}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 12, width: "100%" }}>
          <button className="btn btn-ghost btn-md" onClick={onCancel} style={{ flex: 1 }}>Huỷ</button>
          <button className="btn btn-primary btn-md" onClick={() => otp.length === 6 && onSubmit(otp)}
            disabled={otp.length < 6} style={{ flex: 2, opacity: otp.length < 6 ? .5 : 1 }}>
            Xác nhận OTP
          </button>
        </div>
      </div>
    </OverlayWrap>
  );
}

function VneIDOverlay({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [countdown, setCountdown] = useState(120);
  useEffect(() => {
    const t = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  const mm = Math.floor(countdown / 60), ss = String(countdown % 60).padStart(2, "0");

  return (
    <OverlayWrap>
      <div className="card" style={{ width: 560, borderRadius: 28, padding: "40px 44px", display: "flex", flexDirection: "column", alignItems: "center", gap: 22, textAlign: "center" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink-0)" }}>Xác thực VNeID</div>
          <div style={{ fontSize: 14, color: "var(--ink-4)", marginTop: 8, lineHeight: 1.6 }}>
            Mở ứng dụng <b>VNeID</b> trên điện thoại, chọn <b>Quét QR</b><br />
            và hướng camera vào mã bên dưới
          </div>
        </div>

        {/* QR placeholder */}
        <div style={{ padding: 16, background: "#fff", borderRadius: 16, border: "2px solid var(--ink-7)", boxShadow: "var(--shadow-md)" }}>
          <svg width={180} height={180} viewBox="0 0 180 180">
            {Array.from({ length: 9 }).flatMap((_, r) =>
              Array.from({ length: 9 }, (__, c) =>
                (r * 7 + c * 11 + r * c) % 3 !== 0 ? (
                  <rect key={`${r}-${c}`} x={r * 20} y={c * 20} width={20} height={20} fill="#0F172A" />
                ) : null
              )
            )}
            {([[0,0],[120,0],[0,120]] as [number,number][]).map(([x,y], i) => (
              <g key={i} transform={`translate(${x},${y})`}>
                <rect width={60} height={60} fill="#0F172A" rx={4}/>
                <rect x={8} y={8} width={44} height={44} fill="#fff" rx={2}/>
                <rect x={16} y={16} width={28} height={28} fill="#0F172A" rx={2}/>
              </g>
            ))}
          </svg>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, color: countdown < 30 ? "var(--red)" : "var(--ink-4)", fontSize: 14 }}>
          <Icon name="clock" size={16} />
          Mã hết hạn sau {mm}:{ss}
        </div>

        {[["1","Mở ứng dụng VNeID"],["2","Chọn Quét QR code"],["3","Hướng camera vào mã"]].map(([n, t]) => (
          <div key={n} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--blue-lt)", color: "var(--blue)", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</div>
            <span style={{ fontSize: 14, color: "var(--ink-2)" }}>{t}</span>
          </div>
        ))}

        <div style={{ display: "flex", gap: 12, width: "100%" }}>
          <button className="btn btn-ghost btn-md" onClick={onCancel} style={{ flex: 1 }}>Huỷ</button>
          <button className="btn btn-teal btn-md" onClick={onDone} style={{ flex: 2 }}>
            <Icon name="check" size={18} /> Tôi đã quét xong
          </button>
        </div>
      </div>
    </OverlayWrap>
  );
}

function CaptchaOverlay({ onClose }: { onClose: () => void }) {
  return (
    <OverlayWrap>
      <div className="card" style={{ width: 500, borderRadius: 28, padding: "48px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--orange-lt)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="user" size={30} style={{ color: "var(--orange-dk)" }} />
        </div>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink-0)", marginBottom: 8 }}>Cần xác thực bảo mật</div>
          <div style={{ fontSize: 15, color: "var(--ink-3)", lineHeight: 1.6 }}>
            Cổng dịch vụ công yêu cầu xác nhận thêm.<br/>
            Nhân viên sẽ hỗ trợ bạn trong giây lát.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 22px", borderRadius: 12, background: "var(--orange-lt)" }}>
          <Spinner size={18} color="var(--orange-dk)" />
          <span style={{ fontSize: 14, color: "var(--orange-dk)", fontWeight: 600 }}>Đang chờ hỗ trợ...</span>
        </div>
        <button className="btn btn-orange btn-md" onClick={onClose} style={{ width: "100%" }}>
          <Icon name="phone" size={18} /> Gọi nhân viên hỗ trợ
        </button>
      </div>
    </OverlayWrap>
  );
}

function SuccessOverlay({ code, onDone }: { code: string; onDone: () => void }) {
  return (
    <OverlayWrap>
      <div className="card" style={{ width: 660, borderRadius: 28, padding: "48px 52px", display: "flex", flexDirection: "column", alignItems: "center", gap: 24, textAlign: "center" }}>
        <div style={{ width: 84, height: 84, borderRadius: "50%", background: "var(--green-lt)", display: "flex", alignItems: "center", justifyContent: "center", animation: "pop .5s ease both" }}>
          <Icon name="check" size={40} style={{ color: "var(--green)" }} />
        </div>
        <div>
          <div style={{ fontSize: 28, fontWeight: 900, color: "var(--ink-0)", marginBottom: 10 }}>Nộp hồ sơ thành công!</div>
          <div style={{ fontSize: 15, color: "var(--ink-4)", lineHeight: 1.6 }}>
            Hồ sơ đã được tiếp nhận và đang xử lý.<br/>
            Tra cứu tiến độ bằng mã biên lai bên dưới.
          </div>
        </div>

        <div style={{ background: "var(--green-lt)", borderRadius: 16, padding: "22px 36px", border: "1.5px solid var(--green)", width: "100%" }}>
          <div style={{ fontSize: 12, color: "var(--green)", fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>MÃ BIÊN LAI HỒ SƠ</div>
          <div style={{ fontSize: 30, fontWeight: 900, color: "var(--green)", letterSpacing: 4 }}>{code}</div>
        </div>

        {[
          ["Thời gian giải quyết",  "5–7 ngày làm việc"],
          ["Nhận kết quả",          "Tại cơ quan hoặc qua bưu điện"],
          ["Tra cứu online",        "dichvucong.gov.vn"],
          ["Tổng đài hỗ trợ",       "1900 6017"],
        ].map(([l, v]) => (
          <div key={l} style={{ display: "flex", justifyContent: "space-between", width: "100%", padding: "10px 0", borderBottom: "1px solid var(--ink-7)" }}>
            <span style={{ fontSize: 14, color: "var(--ink-4)" }}>{l}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-1)" }}>{v}</span>
          </div>
        ))}

        <button className="btn btn-primary btn-xl" onClick={onDone} style={{ width: "100%", marginTop: 8 }}>
          <Icon name="home" size={22} /> Hoàn thành
        </button>
      </div>
    </OverlayWrap>
  );
}

// ─── Simulated government portal ──────────────────────────────────────────────

function SimPortal({ stepId, action }: { stepId: string; action: string }) {
  const isFill = stepId === "fill";
  const isUpload = stepId === "upload";

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#fff", fontSize: 11 }}>
      {/* Gov header */}
      <div style={{ height: 40, background: "#1a4f7a", display: "flex", alignItems: "center", padding: "0 16px", gap: 10, flexShrink: 0 }}>
        <div style={{ width: 26, height: 26, borderRadius: 4, background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 14, height: 14, borderRadius: 2, border: "2px solid rgba(255,255,255,.7)" }} />
        </div>
        <div>
          <div style={{ fontSize: 9, color: "#fff", fontWeight: 700, letterSpacing: .5 }}>CỔNG DỊCH VỤ CÔNG QUỐC GIA</div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,.6)" }}>dichvucong.gov.vn</div>
        </div>
      </div>

      {/* Nav */}
      <div style={{ height: 30, background: "#f0f2f5", borderBottom: "1px solid #dde", display: "flex", alignItems: "center", padding: "0 16px", gap: 20, flexShrink: 0 }}>
        {["Trang chủ","Thủ tục","Hồ sơ của tôi","Tra cứu"].map(t => (
          <span key={t} style={{ fontSize: 10, color: t === "Hồ sơ của tôi" ? "#0068b7" : "#555", fontWeight: t === "Hồ sơ của tôi" ? 700 : 400, borderBottom: t === "Hồ sơ của tôi" ? "2px solid #0068b7" : "none", paddingBottom: 2 }}>{t}</span>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: "14px 20px", overflowY: "hidden", display: "flex", gap: 16 }}>
        {/* Form area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#1a4f7a", borderBottom: "2px solid #0068b7", paddingBottom: 6 }}>
            Cấp lại thẻ căn cước công dân
          </div>

          {isFill ? (
            // Animated form filling
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                ["Họ và tên", "Nguyễn Thị Lan Anh", true],
                ["Ngày sinh", "12/08/1988", true],
                ["Giới tính", "Nữ", true],
                ["Số CCCD", "079088012345", true],
                ["Địa chỉ thường trú", "Số 47, Ngõ 62...", false],
                ["Email", "lan.anh@gmail.com", false],
              ].map(([label, val, filled], i) => (
                <div key={label as string} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <label style={{ fontSize: 9, color: "#666", fontWeight: 600 }}>{label}</label>
                  <div style={{
                    height: 24, borderRadius: 4, border: `1px solid ${filled ? "#0068b7" : "#ccc"}`,
                    padding: "0 8px", display: "flex", alignItems: "center", fontSize: 10,
                    background: filled ? "#e8f2fb" : "#fff", color: filled ? "#003d73" : "#333",
                    animation: filled ? `fadeIn ${0.3 + i * 0.15}s ease both` : "none",
                  }}>
                    {filled ? val : ""}
                    {filled && <span style={{ marginLeft: 2, display: "inline-block", width: 1, height: 12, background: "#0068b7", animation: "blink 1s step-end infinite" }} />}
                  </div>
                </div>
              ))}
            </div>
          ) : isUpload ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {["CCCD bản sao (công chứng)", "Ảnh thẻ 3×4", "Giấy khai sinh"].map((name, i) => (
                <div key={name} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                  borderRadius: 6, background: i < 2 ? "#dcfce7" : "#f1f5f9",
                  border: `1px solid ${i < 2 ? "#16a34a" : "#cbd5e1"}`,
                  animation: `fadeIn ${0.2 + i * 0.3}s ease both`,
                }}>
                  <div style={{ width: 16, height: 16, borderRadius: 3, background: i < 2 ? "#16a34a" : "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {i < 2 && <span style={{ color: "#fff", fontSize: 9 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: i < 2 ? "#15803d" : "#64748b" }}>{name}</span>
                  {i < 2 && <span style={{ marginLeft: "auto", fontSize: 9, color: "#16a34a" }}>Đã tải lên</span>}
                  {i === 2 && <Spinner size={10} color="#64748b" />}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 120, flexDirection: "column", gap: 8 }}>
              <Spinner size={22} color="#0068b7" />
              <span style={{ fontSize: 10, color: "#666" }}>{action}</span>
            </div>
          )}
        </div>

        {/* Right sidebar: steps */}
        <div style={{ width: 130, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: "#888", marginBottom: 4 }}>TIẾN TRÌNH</div>
          {["Chọn thủ tục", "Điền thông tin", "Đính kèm", "Xác nhận", "Nộp hồ sơ"].map((s, i) => (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 14, height: 14, borderRadius: "50%", background: i < 2 ? "#0068b7" : i === 2 ? "#f59e0b" : "#e2e8f0", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {i < 2 && <span style={{ color: "#fff", fontSize: 7 }}>✓</span>}
                {i === 2 && <Spinner size={8} color="#fff" />}
              </div>
              <span style={{ fontSize: 9, color: i < 2 ? "#0068b7" : i === 2 ? "#b45309" : "#94a3b8", fontWeight: i <= 2 ? 600 : 400 }}>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function ProcedureSubmitScreen({
  lang, onLangChange, onHome, onHelp, onComplete,
  sessionId, deviceSerial, templateId, procedureName = "Cấp lại thẻ căn cước công dân",
  jobId: externalJobId,
  citizenData = DEFAULT_CITIZEN,
}: Props) {
  const [activeStep, setActiveStep]     = useState(0);
  const [stepStatus, setStepStatus]     = useState<StepStatus[]>(DEMO_STEPS.map((_, i) => i === 0 ? "active" : "pending"));
  const [interaction, setInteraction]   = useState<InteractionType | null>(null);
  const [progressPct, setProgressPct]   = useState(0);
  const [elapsedSec, setElapsedSec]     = useState(0);
  const [currentJobId, setCurrentJobId] = useState<string | null>(externalJobId ?? null);
  const [appCode]                       = useState(() => genCode());
  const [done, setDone]                 = useState(false);
  const [failed, setFailed]             = useState<string | null>(null);
  const [screenshot, setScreenshot]     = useState<string | undefined>();

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Elapsed time counter
  useEffect(() => {
    elapsedRef.current = setInterval(() => setElapsedSec(s => s + 1), 1000);
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, []);

  // ── Simulation engine ──────────────────────────────────────────────────────
  const advanceStep = useCallback((idx: number) => {
    if (idx >= DEMO_STEPS.length) {
      setDone(true);
      return;
    }
    const step = DEMO_STEPS[idx];

    // Mark previous done, current active
    setStepStatus(prev => prev.map((_, i) => i < idx ? "done" : i === idx ? "active" : "pending"));
    setActiveStep(idx);
    setProgressPct(Math.round((idx / DEMO_STEPS.length) * 100));

    if (step.interaction) {
      // Pause and show citizen interaction overlay
      setInteraction(step.interaction);
      return; // wait for citizen to respond
    }

    // Auto-advance after duration
    timerRef.current = setTimeout(() => advanceStep(idx + 1), step.durationMs);
  }, []);

  // Start simulation on mount
  useEffect(() => {
    // Optionally dispatch a real Selenium job if templateId given
    if (templateId && !externalJobId) {
      seleniumApi.dispatch({
        templateId,
        kioskSessionId: sessionId,
        deviceSerial,
        inputData: citizenData as Record<string, unknown>,
      }).then(job => setCurrentJobId(job.id)).catch(() => {/* demo mode */});
    }

    // Always run simulation so screen is responsive even without a real runner
    timerRef.current = setTimeout(() => advanceStep(0), 600);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── WebSocket progress from real Selenium runner ───────────────────────────
  useEffect(() => {
    if (!currentJobId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let socket: any = null;
    let disposed = false;
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

    import("socket.io-client").then(({ io }) => {
      if (disposed) return;
      socket = io(`${wsUrl}/device`, { transports: ["websocket", "polling"] });
      socket.on("connect", () => {
        if (deviceSerial) socket.emit("heartbeat", { deviceId: deviceSerial });
      });

      socket.on("selenium:progress", (data: {
        jobId: string;
        status: string;
        progressPercent: number;
        currentStepOrder: number;
        citizenMessage?: string;
      }) => {
        if (data.jobId !== currentJobId) return;
        setProgressPct(data.progressPercent ?? 0);
        if (data.currentStepOrder !== undefined) {
          const idx = Math.min(data.currentStepOrder, DEMO_STEPS.length - 1);
          setStepStatus(prev => prev.map((_, i) => i < idx ? "done" : i === idx ? "active" : "pending"));
          setActiveStep(idx);
        }
      });

      socket.on("selenium:needs_input", (data: { jobId: string; inputType: string }) => {
        if (data.jobId !== currentJobId) return;
        setInteraction(data.inputType as InteractionType);
        if (timerRef.current) clearTimeout(timerRef.current);
      });
    });

    return () => { disposed = true; socket?.disconnect(); };
  }, [currentJobId, deviceSerial]);

  // ── Citizen interaction handlers ───────────────────────────────────────────
  function handleInteractionDone(value?: string) {
    setInteraction(null);
    if (currentJobId) {
      seleniumApi.submitCitizenInput(currentJobId, {
        inputType: interaction ?? "CONFIRM",
        value,
      }).catch(() => {});
    }
    // Continue demo simulation
    timerRef.current = setTimeout(() => advanceStep(activeStep + 1), 400);
  }

  function handleCancel() {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (currentJobId) seleniumApi.cancel(currentJobId).catch(() => {});
    onHome();
  }

  const currentStep = DEMO_STEPS[activeStep];
  const elapsed = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, "0")}`;

  return (
    <div style={{ width: 1920, height: 1080, display: "flex", flexDirection: "column", background: "var(--ink-8)", position: "relative", overflow: "hidden" }}>
      <TopBar lang={lang} onLangChange={onLangChange} onHome={onHome} onHelp={onHelp}
        title="Đang nộp hồ sơ" subtitle="Hệ thống đang tự động xử lý cho bạn" />

      <div style={{ flex: 1, display: "flex", gap: 0, minHeight: 0 }}>

        {/* ── Left: Step list ─────────────────────────────────────────────── */}
        <div style={{
          width: 340, background: "#fff", borderRight: "1.5px solid var(--ink-7)",
          display: "flex", flexDirection: "column", flexShrink: 0,
        }}>
          <div style={{ padding: "24px 28px 16px", borderBottom: "1px solid var(--ink-7)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-4)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 4 }}>Các bước thực hiện</div>
            <div style={{ fontSize: 11, color: "var(--ink-5)" }}>{DEMO_STEPS.length} bước tự động</div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "16px 28px" }}>
            {DEMO_STEPS.map((step, i) => {
              const status = stepStatus[i];
              const isActive = status === "active";
              return (
                <div key={step.id} style={{ display: "flex", gap: 12, marginBottom: 8, position: "relative" }}>
                  {/* Connector line */}
                  {i < DEMO_STEPS.length - 1 && (
                    <div style={{
                      position: "absolute", left: 17, top: 40, width: 2, height: "calc(100% - 4px)",
                      background: status === "done" ? "var(--green)" : "var(--ink-7)",
                      transition: "background .4s",
                    }} />
                  )}
                  <StepBullet status={status} />
                  <div style={{ flex: 1, paddingBottom: 20 }}>
                    <div style={{
                      fontSize: 14, fontWeight: isActive ? 800 : status === "done" ? 600 : 500,
                      color: isActive ? "var(--blue)" : status === "done" ? "var(--green)" : "var(--ink-4)",
                      lineHeight: 1.3,
                    }}>
                      {step.label}
                    </div>
                    {isActive && (
                      <div style={{ fontSize: 12, color: "var(--blue)", marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
                        <Spinner size={10} color="var(--blue)" />
                        {step.interaction ? "Chờ xác nhận" : "Đang thực hiện..."}
                      </div>
                    )}
                    {status === "done" && (
                      <div style={{ fontSize: 11, color: "var(--green)", marginTop: 3 }}>Hoàn thành</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer info */}
          <div style={{ padding: "16px 28px", borderTop: "1px solid var(--ink-7)", background: "var(--ink-9)" }}>
            <div style={{ fontSize: 12, color: "var(--ink-4)" }}>Mã phiên: <b style={{ color: "var(--ink-1)" }}>{currentJobId ? currentJobId.slice(0, 8).toUpperCase() : "DEMO"}</b></div>
            <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 4 }}>Thời gian: <b style={{ color: "var(--ink-1)" }}>{elapsed}</b></div>
          </div>
        </div>

        {/* ── Center: Live browser view ────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 24px 24px 24px", gap: 14, minWidth: 0 }}>
          {/* Browser chrome */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", borderRadius: 14, overflow: "hidden", border: "1.5px solid var(--ink-6)", boxShadow: "var(--shadow-lg)", background: "#f0f2f5" }}>
            {/* Browser toolbar */}
            <div style={{ height: 44, background: "#e8eaed", display: "flex", alignItems: "center", padding: "0 14px", gap: 10, borderBottom: "1px solid #d0d2d5", flexShrink: 0 }}>
              {["#FF5F57","#FFBD2E","#28C840"].map((c, i) => (
                <div key={i} style={{ width: 12, height: 12, borderRadius: "50%", background: c }} />
              ))}
              <div style={{ flex: 1, height: 28, borderRadius: 6, background: "#fff", border: "1px solid #c8cace", display: "flex", alignItems: "center", padding: "0 10px", gap: 6, margin: "0 8px" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", border: "1.5px solid var(--green)", position: "relative" }}>
                  <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--green)", position: "absolute", top: 1, left: 1 }} />
                </div>
                <span style={{ fontSize: 11.5, color: "var(--ink-3)", fontFamily: "monospace", letterSpacing: -.2 }}>
                  dichvucong.gov.vn/thu-tuc/{currentStep?.id ?? ""}
                </span>
                <div style={{ marginLeft: "auto" }}><Spinner size={13} color="var(--blue)" /></div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {["←","→","⟳"].map(s => (
                  <div key={s} style={{ width: 26, height: 26, borderRadius: 4, background: "#d0d2d5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#555" }}>{s}</div>
                ))}
              </div>
            </div>

            {/* Portal content */}
            <div style={{ flex: 1, overflow: "hidden" }}>
              {screenshot
                ? <img src={screenshot} alt="DVC portal" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : <SimPortal stepId={currentStep?.id ?? ""} action={currentStep?.portalAction ?? ""} />
              }
            </div>
          </div>

          {/* Status bar */}
          <div style={{
            height: 52, borderRadius: 12, background: "#fff", border: "1.5px solid var(--ink-7)",
            display: "flex", alignItems: "center", padding: "0 20px", gap: 14,
            boxShadow: "var(--shadow-sm)", flexShrink: 0,
          }}>
            <Spinner size={18} />
            <span style={{ fontSize: 16, color: "var(--ink-2)", fontWeight: 600 }}>{currentStep?.citizenMsg}</span>
            <div style={{ display: "flex", gap: 4, marginLeft: 4 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--blue)", animation: `wave .9s ease-in-out ${i * 0.15}s infinite` }} />
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: Info + progress ───────────────────────────────────────── */}
        <div style={{
          width: 320, borderLeft: "1.5px solid var(--ink-7)", background: "#fff",
          display: "flex", flexDirection: "column", gap: 0, flexShrink: 0,
        }}>
          {/* Procedure info */}
          <div style={{ padding: "24px 24px 20px", borderBottom: "1px solid var(--ink-7)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-4)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 10 }}>Thủ tục đang nộp</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "var(--ink-0)", lineHeight: 1.4, marginBottom: 12 }}>{procedureName}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: "var(--blue-lt)", color: "var(--blue)" }}>Trực tuyến</span>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: "var(--green-lt)", color: "var(--green)" }}>Tự động</span>
            </div>
          </div>

          {/* Progress */}
          <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--ink-7)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 13, color: "var(--ink-4)" }}>Tiến độ</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: "var(--blue)" }}>{progressPct}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: "var(--ink-7)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 999, background: "linear-gradient(90deg, var(--blue) 0%, var(--teal) 100%)", width: `${progressPct}%`, transition: "width .6s ease" }} />
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 8 }}>
              Bước {activeStep + 1} / {DEMO_STEPS.length} — {elapsed}
            </div>
          </div>

          {/* Step-by-step status */}
          <div style={{ flex: 1, padding: "16px 24px", overflowY: "auto" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-4)", letterSpacing: .5, textTransform: "uppercase", marginBottom: 12 }}>Trạng thái hệ thống</div>
            {DEMO_STEPS.slice(0, activeStep + 2).map((step, i) => {
              const status = stepStatus[i];
              return (
                <div key={step.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10,
                  padding: "10px 12px", borderRadius: 10,
                  background: status === "active" ? "var(--blue-lt)" : status === "done" ? "var(--green-lt)" : "transparent",
                  border: status === "active" ? "1px solid var(--blue-mid)" : status === "done" ? "1px solid #bbf7d0" : "none",
                }}>
                  {status === "done" && <Icon name="check" size={14} style={{ color: "var(--green)", marginTop: 1, flexShrink: 0 }} />}
                  {status === "active" && <Spinner size={14} color="var(--blue)" />}
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: status === "active" ? "var(--blue)" : status === "done" ? "var(--green)" : "var(--ink-3)" }}>
                      {step.label}
                    </div>
                    {status === "active" && (
                      <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>Đang thực hiện</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Cancel button */}
          <div style={{ padding: "16px 24px", borderTop: "1px solid var(--ink-7)" }}>
            <button className="btn btn-ghost btn-sm" onClick={handleCancel} style={{ width: "100%", color: "var(--red)", borderColor: "var(--red-lt)" }}>
              <Icon name="x" size={16} /> Dừng và về trang chủ
            </button>
            <div style={{ fontSize: 11, color: "var(--ink-5)", textAlign: "center", marginTop: 8 }}>
              Dừng sẽ huỷ quá trình nộp hồ sơ
            </div>
          </div>
        </div>
      </div>

      {/* ── Interaction overlays ─────────────────────────────────────────────── */}
      {interaction === "CONFIRM_DATA" && (
        <ConfirmDataOverlay
          data={citizenData}
          onConfirm={() => handleInteractionDone("CONFIRMED")}
          onCancel={handleCancel}
        />
      )}
      {interaction === "OTP_SMS" && (
        <OtpOverlay
          onSubmit={otp => handleInteractionDone(otp)}
          onCancel={handleCancel}
        />
      )}
      {interaction === "VNEID_QR" && (
        <VneIDOverlay
          onDone={() => handleInteractionDone("SCANNED")}
          onCancel={handleCancel}
        />
      )}
      {interaction === "CAPTCHA_WAIT" && (
        <CaptchaOverlay onClose={() => handleInteractionDone("STAFF_RESOLVED")} />
      )}

      {/* ── Done overlay ─────────────────────────────────────────────────────── */}
      {done && (
        <SuccessOverlay
          code={appCode}
          onDone={() => onComplete({ success: true, applicationCode: appCode })}
        />
      )}

      {/* ── Failed overlay ───────────────────────────────────────────────────── */}
      {failed && (
        <OverlayWrap>
          <div className="card" style={{ width: 500, borderRadius: 28, padding: "44px 48px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20, textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--red-lt)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="x" size={30} style={{ color: "var(--red)" }} />
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "var(--ink-0)", marginBottom: 8 }}>Không thể nộp hồ sơ</div>
              <div style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.6 }}>{failed}</div>
            </div>
            <div style={{ display: "flex", gap: 12, width: "100%" }}>
              <button className="btn btn-ghost btn-md" onClick={handleCancel} style={{ flex: 1 }}>Về trang chủ</button>
              <button className="btn btn-primary btn-md" onClick={() => { setFailed(null); advanceStep(0); }} style={{ flex: 1 }}>Thử lại</button>
            </div>
          </div>
        </OverlayWrap>
      )}
    </div>
  );
}
