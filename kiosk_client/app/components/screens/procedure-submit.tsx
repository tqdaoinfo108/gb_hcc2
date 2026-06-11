"use client";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { TopBar } from "../ui";
import { Icon } from "../icons";
import { seleniumApi, workflowApi } from "../../lib/api";
import { VirtualKeyboard } from "../VirtualKeyboard";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  lang: "vi" | "en";
  onLangChange: (l: "vi" | "en") => void;
  onHome: () => void;
  onHelp: () => void;
  onComplete: (result: SubmitResult) => void;
  sessionId?: string;
  deviceSerial?: string;
  /** DB UUID of the procedure to submit — when provided, calls real workflow pipeline */
  procedureId?: string;
  citizenId?: string;
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

interface FramePoint {
  x: number;
  y: number;
}

interface FrameGesture {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  moved: boolean;
  lastSentAt: number;
  pendingPoint: FramePoint | null;
  flushTimer: number | null;
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

const ctrlBtn: React.CSSProperties = {
  width: 40, height: 36, borderRadius: 9, border: "1.5px solid var(--ink-7)",
  background: "#fff", color: "var(--ink-2)", fontSize: 15, fontWeight: 700,
  cursor: "pointer", flexShrink: 0,
};

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

// ─── Main screen ──────────────────────────────────────────────────────────────

export function ProcedureSubmitScreen({
  lang, onLangChange, onHome, onHelp, onComplete,
  sessionId, deviceSerial, procedureId, citizenId,
  procedureName = "Cấp lại thẻ căn cước công dân",
  jobId: externalJobId,
  citizenData = DEFAULT_CITIZEN,
}: Props) {
  const [activeStep, setActiveStep]     = useState(0);
  const [stepStatus, setStepStatus]     = useState<StepStatus[]>(DEMO_STEPS.map((_, i) => i === 0 ? "active" : "pending"));
  const [interaction, setInteraction]   = useState<InteractionType | null>(null);
  const [progressPct, setProgressPct]   = useState(0);
  const [elapsedSec, setElapsedSec]     = useState(0);
  const [currentJobId, setCurrentJobId] = useState<string | null>(externalJobId ?? null);
  /** mode: "loading" = waiting for launch response | "real" = runner active | "demo" = fallback */
  const [mode, setMode]                 = useState<"loading" | "real" | "demo">("loading");
  const [appCode, setAppCode]           = useState(() => genCode());
  const [done, setDone]                 = useState(false);
  const [failed, setFailed]             = useState<string | null>(null);
  const [hasScreenshot, setHasScreenshot] = useState(false);
  const [currentUrl, setCurrentUrl]     = useState<string>("https://dichvucong.gov.vn/");
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [liveMsg, setLiveMsg]           = useState<string | null>(null);
  const activeStepRef                   = useRef(0);
  const imgRef                          = useRef<HTMLImageElement | null>(null);
  const hasScreenshotRef                = useRef(false);
  const frameSequenceRef                = useRef(0);
  const gestureRef                      = useRef<FrameGesture | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pushFrame = useCallback((url: string) => {
    const sequence = ++frameSequenceRef.current;
    const loader = new Image();
    loader.decoding = "async";
    loader.onload = () => {
      if (sequence !== frameSequenceRef.current || !imgRef.current) return;
      imgRef.current.src = url;
      if (!hasScreenshotRef.current) {
        hasScreenshotRef.current = true;
        setHasScreenshot(true);
      }
    };
    loader.src = url;
  }, []);

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

  // Keep activeStepRef in sync so WS handler can read latest value
  useEffect(() => { activeStepRef.current = activeStep; }, [activeStep]);

  // Start real workflow or fall back to demo on mount
  useEffect(() => {
    if (procedureId && sessionId) {
      // ── Real mode: call the convergence entry point ──────────────────
      workflowApi.launch({
        procedureId,
        kioskSessionId: sessionId,
        citizenId,
        deviceSerial,
        source: "MANUAL",
      }).then(r => {
        setCurrentJobId(r.jobId);
        setMode("real");
        // Step list shows "Đang khởi tạo…" — runner will push progress via WS
      }).catch(() => {
        // Procedure has no configured template → fall back to demo
        setMode("demo");
        timerRef.current = setTimeout(() => advanceStep(0), 600);
      });
    } else {
      // No procedureId provided → demo mode
      setMode("demo");
      timerRef.current = setTimeout(() => advanceStep(0), 600);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── WebSocket progress from real Selenium runner ───────────────────────────
  useEffect(() => {
    if (!currentJobId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let socket: any = null;
    let disposed = false;
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
        outputData?: Record<string, unknown>;
        failReason?: string;
      }) => {
        if (data.jobId !== currentJobId) return;

        setProgressPct(data.progressPercent ?? 0);
        if (data.citizenMessage) setLiveMsg(data.citizenMessage);
        if (data.currentStepOrder !== undefined) {
          const idx = Math.min(data.currentStepOrder, DEMO_STEPS.length - 1);
          setStepStatus(prev => prev.map((_, i) => i < idx ? "done" : i === idx ? "active" : "pending"));
          setActiveStep(idx);
        }

        // ── Terminal states from real runner ──────────────────────────
        if (data.status === "COMPLETED") {
          if (timerRef.current) clearTimeout(timerRef.current);
          const realCode = data.outputData?.["applicationCode"];
          if (realCode) setAppCode(String(realCode));
          // Mark all steps done with a slight animation delay
          setStepStatus(DEMO_STEPS.map(() => "done"));
          setProgressPct(100);
          setTimeout(() => setDone(true), 600);
        } else if (data.status === "FAILED") {
          if (timerRef.current) clearTimeout(timerRef.current);
          const cur = activeStepRef.current;
          setStepStatus(prev => prev.map((_, i) => i < cur ? "done" : i === cur ? "error" : "pending"));
          setFailed(data.failReason ?? "Rất tiếc, quy trình nộp hồ sơ chưa hoàn tất. Vui lòng thử lại hoặc nhờ nhân viên hỗ trợ.");
        }
      });

      socket.on("selenium:needs_input", (data: { jobId: string; inputType: string }) => {
        if (data.jobId !== currentJobId) return;
        setInteraction(data.inputType as InteractionType);
        if (timerRef.current) clearTimeout(timerRef.current);
      });

      // Real runner screenshot — live browser view of dichvucong.gov.vn
      socket.on("selenium:screenshot", (data: { jobId: string; screenshotUrl: string; pageUrl?: string }) => {
        if (data.jobId !== currentJobId) return;
        const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
        pushFrame(`${apiBase}${data.screenshotUrl}?t=${Date.now()}`);
        if (data.pageUrl) {
          setCurrentUrl(current => current === data.pageUrl ? current : data.pageUrl!);
        }
      });

      // Runner reports a text input is focused → auto-show the virtual keyboard
      socket.on("selenium:input_focus", (data: { jobId: string; focused: boolean }) => {
        if (data.jobId !== currentJobId) return;
        if (data.focused) setShowKeyboard(true);
      });
    });

    return () => { disposed = true; socket?.disconnect(); };
  }, [currentJobId, deviceSerial, pushFrame]);

  // ── Citizen interaction handlers ───────────────────────────────────────────
  function handleInteractionDone(value?: string) {
    setInteraction(null);
    if (currentJobId) {
      // Submit citizen input to runner (real mode) or ignore (demo)
      seleniumApi.submitCitizenInput(currentJobId, {
        inputType: interaction ?? "CONFIRM",
        value,
      }).catch(() => {});
    }
    // In demo mode, advance the simulation; in real mode the runner drives progress
    if (mode === "demo") {
      timerRef.current = setTimeout(() => advanceStep(activeStep + 1), 400);
    }
  }

  function handleCancel() {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (currentJobId) seleniumApi.cancel(currentJobId).catch(() => {});
    onHome();
  }

  // ── Interactive remote control ─────────────────────────────────────────────
  function mapFramePoint(clientX: number, clientY: number): FramePoint | null {
    const img = imgRef.current;
    if (!img) return null;
    const rect = img.getBoundingClientRect();
    const natW = img.naturalWidth || 1366, natH = img.naturalHeight || 900;
    const scale = Math.min(rect.width / natW, rect.height / natH);
    if (!scale) return null;
    const offsetX = (rect.width - natW * scale) / 2;
    const offsetY = (rect.height - natH * scale) / 2;
    const x = (clientX - rect.left - offsetX) / scale;
    const y = (clientY - rect.top - offsetY) / scale;
    if (x < 0 || y < 0 || x > natW || y > natH) return null;
    return { x: Math.round(x), y: Math.round(y) };
  }

  function flushTouchMove() {
    const gesture = gestureRef.current;
    if (!gesture || !gesture.pendingPoint || !currentJobId) return;
    const point = gesture.pendingPoint;
    gesture.pendingPoint = null;
    gesture.flushTimer = null;
    gesture.lastSentAt = performance.now();
    seleniumApi.interact(currentJobId, { type: "touchMove", ...point }).catch(() => {});
  }

  function queueTouchMove(point: FramePoint) {
    const gesture = gestureRef.current;
    if (!gesture) return;
    gesture.pendingPoint = point;
    const wait = Math.max(0, 45 - (performance.now() - gesture.lastSentAt));
    if (wait === 0) {
      flushTouchMove();
    } else if (gesture.flushTimer === null) {
      gesture.flushTimer = window.setTimeout(flushTouchMove, wait);
    }
  }

  function handleFramePointerDown(e: React.PointerEvent<HTMLImageElement>) {
    if (mode !== "real" || !currentJobId) return;
    const point = mapFramePoint(e.clientX, e.clientY);
    if (!point) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    gestureRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
      lastSentAt: performance.now(),
      pendingPoint: null,
      flushTimer: null,
    };
    seleniumApi.interact(currentJobId, { type: "touchStart", ...point }).catch(() => {});
  }

  function handleFramePointerMove(e: React.PointerEvent<HTMLImageElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId) return;
    const point = mapFramePoint(e.clientX, e.clientY);
    if (!point) return;
    e.preventDefault();
    if (Math.hypot(e.clientX - gesture.startClientX, e.clientY - gesture.startClientY) > 6) {
      gesture.moved = true;
    }
    queueTouchMove(point);
  }

  function finishFrameGesture(e: React.PointerEvent<HTMLImageElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId || !currentJobId) return;
    e.preventDefault();
    if (gesture.flushTimer !== null) window.clearTimeout(gesture.flushTimer);
    const point = mapFramePoint(e.clientX, e.clientY) ?? gesture.pendingPoint;
    if (point && gesture.moved) {
      seleniumApi.interact(currentJobId, { type: "touchMove", ...point }).catch(() => {});
    }
    seleniumApi.interact(currentJobId, {
      type: "touchEnd",
      ...(point ?? {}),
    }).catch(() => {});
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    gestureRef.current = null;
  }

  function handleFramePointerCancel(e: React.PointerEvent<HTMLImageElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== e.pointerId || !currentJobId) return;
    if (gesture.flushTimer !== null) window.clearTimeout(gesture.flushTimer);
    seleniumApi.interact(currentJobId, { type: "touchEnd" }).catch(() => {});
    gestureRef.current = null;
  }

  const sendChar = (text: string) => { if (currentJobId) seleniumApi.interact(currentJobId, { type: "type", text }).catch(() => {}); };
  const sendKey  = (key: "Backspace" | "Enter" | "Tab") => { if (currentJobId) seleniumApi.interact(currentJobId, { type: "key", key }).catch(() => {}); };
  const sendScroll = (deltaY: number, deltaX = 0) => {
    if (currentJobId) seleniumApi.interact(currentJobId, { type: "scroll", deltaX, deltaY }).catch(() => {});
  };

  function handleFinish() {
    if (!currentJobId) return;
    seleniumApi.interact(currentJobId, { type: "finish" }).catch(() => {});
    setShowKeyboard(false);
  }

  const currentStep = DEMO_STEPS[activeStep];
  const elapsed = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, "0")}`;
  const statusMsg = mode === "loading"
    ? "Đang kết nối với hệ thống dịch vụ công…"
    : mode === "real"
      ? (liveMsg ?? currentStep?.citizenMsg ?? "Đang xử lý…")
      : (currentStep?.citizenMsg ?? "Đang xử lý…");

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
            <div style={{ fontSize: 12, color: "var(--ink-4)" }}>Mã phiên: <b style={{ color: mode === "real" ? "var(--green)" : "var(--ink-1)" }}>{currentJobId ? currentJobId.slice(0, 8).toUpperCase() : (mode === "loading" ? "…" : "DEMO")}</b></div>
          {mode === "real" && <div style={{ fontSize: 10, color: "var(--green)", marginTop: 2 }}>● Đang nộp thật</div>}
          {mode === "demo" && <div style={{ fontSize: 10, color: "var(--orange-dk)", marginTop: 2 }}>● Chế độ demo</div>}
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
                <span style={{ fontSize: 11.5, color: "var(--ink-3)", fontFamily: "monospace", letterSpacing: -.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {currentUrl.replace(/^https?:\/\//, "")}
                </span>
                <div style={{ marginLeft: "auto" }}><Spinner size={13} color="var(--blue)" /></div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {["←","→","⟳"].map(s => (
                  <div key={s} style={{ width: 26, height: 26, borderRadius: 4, background: "#d0d2d5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#555" }}>{s}</div>
                ))}
              </div>
            </div>

            {/* Live portal content — real Playwright screenshot streamed from runner */}
            <div style={{ flex: 1, overflow: "hidden", background: "#fff", position: "relative" }}>
              <img
                ref={imgRef}
                alt="Cổng dịch vụ công"
                onPointerDown={handleFramePointerDown}
                onPointerMove={handleFramePointerMove}
                onPointerUp={finishFrameGesture}
                onPointerCancel={handleFramePointerCancel}
                onWheel={e => {
                  e.preventDefault();
                  sendScroll(e.deltaY, e.deltaX);
                }}
                onContextMenu={e => e.preventDefault()}
                draggable={false}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  objectPosition: "top",
                  background: "#fff",
                  cursor: mode === "real" ? "grab" : "default",
                  opacity: hasScreenshot ? 1 : 0,
                  touchAction: "none",
                  userSelect: "none",
                  willChange: "contents",
                  transform: "translateZ(0)",
                }}
              />
              {!hasScreenshot && (
                <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, background: "#f8fafc" }}>
                  <Spinner size={40} color="var(--blue)" />
                  <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink-2)" }}>
                    Đang kết nối tới Cổng Dịch vụ công Quốc gia…
                  </div>
                  <div style={{ fontSize: 13, color: "var(--ink-4)", display: "flex", alignItems: "center", gap: 6 }}>
                    <Icon name="shield" size={15} style={{ color: "var(--green)" }} />
                    dichvucong.gov.vn — phiên tự động an toàn
                  </div>
                </div>
              )}
              {/* Live indicator */}
              {mode === "real" && (
                <div style={{ position: "absolute", top: 12, right: 12, display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 999, background: "rgba(220,38,38,.92)", boxShadow: "var(--shadow-md)" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff", animation: "wave 1.2s ease-in-out infinite" }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#fff", letterSpacing: .5 }}>TRỰC TIẾP</span>
                </div>
              )}
            </div>
          </div>

          {/* Status bar */}
          <div style={{
            height: 52, borderRadius: 12, background: "#fff", border: "1.5px solid var(--ink-7)",
            display: "flex", alignItems: "center", padding: "0 20px", gap: 14,
            boxShadow: "var(--shadow-sm)", flexShrink: 0,
          }}>
            <Spinner size={18} />
            <span style={{ fontSize: 16, color: "var(--ink-2)", fontWeight: 600 }}>{statusMsg}</span>
            <div style={{ display: "flex", gap: 4, marginLeft: 4 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--blue)", animation: `wave .9s ease-in-out ${i * 0.15}s infinite` }} />
              ))}
            </div>

            {/* Interactive controls — only in real mode */}
            {mode === "real" && (
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button onClick={() => sendScroll(-500)} title="Cuộn lên"
                  style={ctrlBtn}>▲</button>
                <button onClick={() => sendScroll(500)} title="Cuộn xuống"
                  style={ctrlBtn}>▼</button>
                <button onClick={() => setShowKeyboard(v => !v)}
                  style={{ ...ctrlBtn, width: "auto", padding: "0 16px", gap: 8, background: showKeyboard ? "var(--blue)" : "#fff", color: showKeyboard ? "#fff" : "var(--ink-2)", display: "flex", alignItems: "center" }}>
                  <span style={{ fontSize: 18 }}>⌨</span> Bàn phím
                </button>
                <button onClick={handleFinish}
                  style={{ ...ctrlBtn, width: "auto", padding: "0 18px", gap: 8, background: "var(--green)", color: "#fff", border: "none", fontWeight: 800, display: "flex", alignItems: "center" }}>
                  <Icon name="check" size={18} style={{ color: "#fff" }} /> Tôi đã hoàn tất
                </button>
              </div>
            )}
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

      {/* ── On-screen keyboard for interactive remote control ────────────────── */}
      {showKeyboard && mode === "real" && !done && !failed && (
        <VirtualKeyboard
          onChar={sendChar}
          onKey={sendKey}
          onClose={() => setShowKeyboard(false)}
        />
      )}
    </div>
  );
}
