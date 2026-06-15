"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { IdleScreen } from "./components/screens/idle";
import { HomeScreen } from "./components/screens/home";
import { AuthScreen } from "./components/screens/auth";
import { ProfileScreen } from "./components/screens/profile";
import { DiscoveryScreen } from "./components/screens/discovery";
import { ChecklistScreen } from "./components/screens/checklist";
import { ScanScreen } from "./components/screens/scan";
import { ReviewScreen } from "./components/screens/review";
import { SuccessScreen } from "./components/screens/success";
import { AIScreen } from "./components/screens/ai";
import { CopyDocScreen } from "./components/screens/copy-doc";
import { ProcedureSubmitScreen } from "./components/screens/procedure-submit";
import { QueueScreen } from "./components/screens/queue";
import { FeedbackScreen } from "./components/screens/feedback";
import { LookupScreen } from "./components/screens/lookup";
import { MaintenanceScreen } from "./components/screens/maintenance";
import { HelpOverlay } from "./components/overlays/help";
import { TimeoutOverlay } from "./components/overlays/timeout";
import { deviceApi, KioskRuntimeConfig, KioskSessionData, otaApi, remoteApi, sessionsApi } from "./lib/api";

type Screen =
  | "idle" | "home"
  | "auth" | "profile" | "discovery" | "checklist" | "scan" | "review" | "success"
  | "ai" | "copy-doc" | "queue" | "feedback" | "lookup"
  | "procedure-submit";

type NativeMetrics = {
  cpuPercent?: number;
  ramPercent?: number;
  diskPercent?: number;
  temperatureC?: number | null;
  hostname?: string | null;
  os?: string | null;
};

type DeviceSocket = {
  // Socket.IO event payloads are runtime-defined by the server.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on: (event: string, listener: (...args: any[]) => void) => unknown;
  emit: (event: string, payload: unknown) => unknown;
  disconnect: () => unknown;
};

type CommandEnvelope = {
  actionId: string;
  command: string;
  payload?: Record<string, unknown>;
  issuedAt?: string;
};

/* ── Remote-debug log capture ──────────────────────────────
 * A bounded in-memory ring buffer of recent console output, so the CMS can
 * pull logs on demand (COLLECT_LOGS) without writing anything to disk. */
const LOG_BUFFER: string[] = [];
const LOG_LIMIT = 500;
let logCapturePatched = false;

function stringifyArg(a: unknown): string {
  if (typeof a === "string") return a;
  try { return JSON.stringify(a); } catch { return String(a); }
}
function ensureLogCapture() {
  if (logCapturePatched || typeof window === "undefined") return;
  logCapturePatched = true;
  (["log", "info", "warn", "error"] as const).forEach((level) => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      try {
        LOG_BUFFER.push(`${new Date().toISOString()} [${level.toUpperCase()}] ${args.map(stringifyArg).join(" ")}`);
        if (LOG_BUFFER.length > LOG_LIMIT) LOG_BUFFER.shift();
      } catch { /* never let logging break the app */ }
      original(...args);
    };
  });
}
function getLogBuffer(): string {
  return LOG_BUFFER.slice(-300).join("\n");
}

/** Best-effort screenshot via the Tauri shell; null in plain-browser mode. */
async function captureScreenshot(): Promise<string | null> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const dataUrl = await invoke<string>("capture_screenshot");
    return dataUrl?.trim() ? dataUrl : null;
  } catch {
    return null;
  }
}

/** Native power command via the Tauri shell. Returns false in browser mode. */
async function nativePower(command: "REBOOT" | "SHUTDOWN"): Promise<boolean> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke(command === "REBOOT" ? "reboot_device" : "shutdown_device");
    return true;
  } catch {
    return false;
  }
}

async function runDiagnostics(currentScreen: string): Promise<string> {
  const metrics = await collectDeviceMetrics();
  const report = {
    at: new Date().toISOString(),
    online: typeof navigator !== "undefined" ? navigator.onLine : null,
    currentScreen,
    appVersion: APP_VERSION,
    apiUrl: WS_URL,
    screen: typeof window !== "undefined" ? `${window.screen.width}x${window.screen.height}` : null,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    metrics,
  };
  return JSON.stringify(report, null, 2);
}

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION?.trim() || "1.0.0";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const INACTIVITY_MS = 180_000;
const HEARTBEAT_MS = 15_000;
const OTA_CHECK_MS = 300_000; // poll for app updates every 5 minutes

export default function KioskRoot() {
  /* Serial number loaded from device.json via /api/device (no env var dependency) */
  const [deviceSerial, setDeviceSerial] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("idle");
  const [lang, setLang] = useState<"vi" | "en">("vi");
  const [showHelp, setShowHelp] = useState(false);
  const [showTimeout, setShowTimeout] = useState(false);
  const [deviceConfig, setDeviceConfig] = useState<KioskRuntimeConfig | null | undefined>(undefined);
  const [session, setSession] = useState<KioskSessionData | null>(null);
  const [startingSession, setStartingSession] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [selectedProcedureId, setSelectedProcedureId] = useState<string | null>(null);
  const [selectedProcedureName, setSelectedProcedureName] = useState<string>("");
  const canvasRef = useRef<HTMLDivElement>(null);

  const fit = useCallback(() => {
    if (!canvasRef.current) return;
    const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    const element = canvasRef.current;
    element.style.transform = `scale(${scale})`;
    element.style.transformOrigin = "top left";
    element.style.left = `${(window.innerWidth - 1920 * scale) / 2}px`;
    element.style.top = `${(window.innerHeight - 1080 * scale) / 2}px`;
  }, []);

  useEffect(() => {
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [fit]);

  /* ── Read serial number from device.json (server-side, no env var) ─ */
  useEffect(() => {
    loadDeviceSerial()
      .then((serial) => {
        console.info(`[Kiosk] Device serial loaded: ${serial}`);
        setDeviceSerial(serial);
      })
      .catch((err) => {
        console.warn("[Kiosk] Failed to load device serial, using fallback:", err);
        setDeviceSerial(`KB-${new Date().getFullYear()}-HN-001`);
      });
  }, []);

  const sendHeartbeat = useCallback(async () => {
    if (!deviceSerial) return;
    try {
      const metrics = await collectDeviceMetrics();
      const config = await deviceApi.heartbeat(deviceSerial, {
        serialNumber: deviceSerial,
        name: `Kiosk ${deviceSerial}`,
        model: "Smart Government Kiosk",
        firmwareVersion: APP_VERSION,
        appVersion: APP_VERSION,
        hostname: metrics.hostname ?? window.location.hostname,
        os: metrics.os ?? getOperatingSystem(),
        browser: getBrowserName(),
        userAgent: navigator.userAgent,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        cpuUsage: metrics.cpuPercent,
        memoryUsage: metrics.ramPercent,
        diskUsage: metrics.diskPercent,
        temperatureC: metrics.temperatureC ?? undefined,
        currentScreen: screen,
        sessionId: session?.id,
      });
      setDeviceConfig(config);
    } catch (error) {
      console.error("Kiosk heartbeat failed:", error);
      setDeviceConfig((current) => current ?? null);
    }
  }, [deviceSerial, screen, session?.id]);

  useEffect(() => {
    void sendHeartbeat();
    const timer = window.setInterval(() => void sendHeartbeat(), HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [sendHeartbeat, retryNonce]);

  /* Keep the latest session in a ref so the (stable) command handler can end
   * it without being torn down and re-subscribed on every session change. */
  const sessionRef = useRef<KioskSessionData | null>(null);
  useEffect(() => { sessionRef.current = session; }, [session]);

  useEffect(() => { ensureLogCapture(); }, []);

  /* Execute a remote command issued from the CMS console and ack the result. */
  const runCommand = useCallback(async (env: CommandEnvelope) => {
    const ack = (
      status: "SUCCESS" | "FAILED" | "UNSUPPORTED",
      result?: string,
      artifact?: string,
    ) => remoteApi.ack({ actionId: env.actionId, status, result, artifact }).catch((e) =>
      console.error("Command ack failed:", e));

    try {
      switch (env.command) {
        case "PING":
          await ack("SUCCESS", `pong • screen=${screen} • ${new Date().toISOString()}`);
          break;
        case "RELOAD":
          await ack("SUCCESS", "Reloading kiosk app");
          setTimeout(() => window.location.reload(), 400);
          break;
        case "GOTO_IDLE": {
          const active = sessionRef.current;
          setSession(null);
          setScreen("idle");
          setShowHelp(false);
          setShowTimeout(false);
          if (active) sessionsApi.complete(active.id).catch(() => {});
          await ack("SUCCESS", "Session ended, returned to idle screen");
          break;
        }
        case "COLLECT_LOGS": {
          const logs = getLogBuffer();
          await ack("SUCCESS", `Collected ${logs ? logs.split("\n").length : 0} log lines`, logs || "(empty)");
          break;
        }
        case "SCREENSHOT": {
          const shot = await captureScreenshot();
          if (shot) await ack("SUCCESS", "Screenshot captured", shot);
          else await ack("UNSUPPORTED", "Screenshot requires the kiosk desktop shell");
          break;
        }
        case "DIAGNOSTICS":
          await ack("SUCCESS", await runDiagnostics(screen));
          break;
        case "REBOOT":
        case "SHUTDOWN": {
          const ok = await nativePower(env.command);
          if (ok) await ack("SUCCESS", `${env.command} initiated`);
          else await ack("UNSUPPORTED", `${env.command} requires the kiosk desktop shell`);
          break;
        }
        default:
          await ack("UNSUPPORTED", `Unknown command: ${env.command}`);
      }
    } catch (error) {
      await ack("FAILED", error instanceof Error ? error.message : String(error));
    }
  }, [screen]);

  const runCommandRef = useRef(runCommand);
  useEffect(() => { runCommandRef.current = runCommand; }, [runCommand]);

  /* ── OTA update agent ──────────────────────────────────────
   * Periodically asks the backend whether an app update applies. When one does
   * AND the kiosk is idle (no active citizen), it downloads the package and
   * verifies its SHA-256, reporting each transition. The native silent install
   * (msiexec) + auto-restart is performed by the Tauri shell if available;
   * otherwise the verified package is left ready and the step is logged.
   * A checksum mismatch or download error is a real FAILED (counts toward the
   * rollout's auto-stop threshold). */
  const [updating, setUpdating] = useState(false);
  const screenRef = useRef(screen);
  useEffect(() => { screenRef.current = screen; }, [screen]);
  const otaBusyRef = useRef(false);

  const checkOta = useCallback(async () => {
    if (!deviceSerial || otaBusyRef.current) return;
    let release: NonNullable<Awaited<ReturnType<typeof otaApi.check>>["release"]> | undefined;
    try {
      const result = await otaApi.check(deviceSerial, APP_VERSION);
      if (!result.updateAvailable || !result.release) return;
      release = result.release;

      // Never interrupt a citizen — only update while idle.
      if (screenRef.current !== "idle" || sessionRef.current) return;

      otaBusyRef.current = true;
      setUpdating(true);
      await otaApi.report({ deviceId: deviceSerial, releaseId: release.id, status: "DOWNLOADING", progress: 10 });

      // Download the package and verify integrity before doing anything with it.
      const res = await fetch(otaApi.downloadUrl(release.downloadUrl), { cache: "no-store" });
      if (!res.ok) throw new Error(`Tải gói thất bại (HTTP ${res.status})`);
      const buf = await res.arrayBuffer();
      if (release.sha256 && globalThis.crypto?.subtle) {
        const digest = await crypto.subtle.digest("SHA-256", buf);
        const hex = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
        if (hex.toLowerCase() !== release.sha256.toLowerCase()) {
          throw new Error("Checksum không khớp — gói cài đặt có thể bị hỏng.");
        }
      }
      await otaApi.report({ deviceId: deviceSerial, releaseId: release.id, status: "DOWNLOADED", progress: 60 });

      // Native silent install + restart (Tauri shell). Deferred where unavailable.
      let invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;
      try { ({ invoke } = await import("@tauri-apps/api/core")); } catch { invoke = null; }
      if (invoke) {
        try {
          await otaApi.report({ deviceId: deviceSerial, releaseId: release.id, status: "INSTALLING", progress: 80 });
          await invoke("ota_install", { url: otaApi.downloadUrl(release.downloadUrl), sha256: release.sha256 ?? "", version: release.version });
          await otaApi.report({ deviceId: deviceSerial, releaseId: release.id, status: "INSTALLED", version: release.version });
        } catch {
          // Native installer not yet wired — package is verified and ready.
          console.info(`[OTA] v${release.version} verified; native install pending.`);
          otaBusyRef.current = false;
          setUpdating(false);
        }
      } else {
        console.info(`[OTA] v${release.version} verified (browser mode); native install pending.`);
        otaBusyRef.current = false;
        setUpdating(false);
      }
    } catch (error) {
      console.error("[OTA] Update failed:", error);
      if (release) {
        await otaApi.report({
          deviceId: deviceSerial, releaseId: release.id, status: "FAILED",
          error: error instanceof Error ? error.message : String(error),
        }).catch(() => {});
      }
      otaBusyRef.current = false;
      setUpdating(false);
    }
  }, [deviceSerial]);

  useEffect(() => {
    if (!deviceSerial) return;
    void checkOta();
    const timer = window.setInterval(() => void checkOta(), OTA_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [deviceSerial, checkOta]);

  useEffect(() => {
    /* Wait until serial is known before opening the socket */
    if (!deviceSerial) return;

    let socket: DeviceSocket | null = null;
    let disposed = false;

    import("socket.io-client").then(({ io }) => {
      if (disposed) return;
      socket = io(`${WS_URL}/device`, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });
      socket.on("connect", () => {
        socket?.emit("heartbeat", { deviceId: deviceSerial });
      });
      socket.on("device:config_updated", (config: KioskRuntimeConfig) => {
        if (config.deviceId === deviceSerial || config.serialNumber === deviceSerial) {
          setDeviceConfig(config);
        }
      });
      socket.on("command", (env: CommandEnvelope) => {
        if (!env?.actionId || !env?.command) return;
        void runCommandRef.current(env);
      });
      socket.on("connect_error", (error) => {
        console.error("Device realtime connection failed:", error.message);
      });
    });

    return () => {
      disposed = true;
      socket?.disconnect();
    };
  }, [deviceSerial]);

  useEffect(() => {
    if (!session) return;
    sessionsApi.updateScreen(session.id, screen).catch((error) => {
      console.error("Failed to update session screen:", error);
    });
  }, [screen, session]);

  useEffect(() => {
    if (deviceConfig && (!deviceConfig.isEnabled || deviceConfig.status === "MAINTENANCE")) {
      setSession(null);
      setScreen("idle");
      setShowHelp(false);
      setShowTimeout(false);
    }
  }, [deviceConfig]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetInactivity = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (screen === "idle") return;
    timerRef.current = setTimeout(() => setShowTimeout(true), INACTIVITY_MS);
  }, [screen]);

  useEffect(() => {
    if (screen === "idle") {
      if (timerRef.current) clearTimeout(timerRef.current);
      setShowTimeout(false);
      return;
    }
    resetInactivity();
    const handleActivity = () => {
      setShowTimeout(false);
      resetInactivity();
    };
    window.addEventListener("pointerdown", handleActivity);
    window.addEventListener("keydown", handleActivity);
    return () => {
      window.removeEventListener("pointerdown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [screen, resetInactivity]);

  async function startSession() {
    if (startingSession || !deviceConfig?.isEnabled) return;
    setStartingSession(true);
    try {
      /* Use the UUID returned by the heartbeat — unambiguously identifies the device */
      const created = await sessionsApi.create({ deviceId: deviceConfig.id, language: lang });
      setSession(created);
      setScreen("home");
    } catch (error) {
      console.error("Failed to start kiosk session:", error);
      await sendHeartbeat();
    } finally {
      setStartingSession(false);
    }
  }

  /** Citizen picked a concrete procedure in DiscoveryScreen → go straight to
   *  the submission screen (skip the "Hồ sơ cần chuẩn bị" checklist). */
  const handleSelectProcedure = useCallback((procedureId: string, _online: boolean, name: string) => {
    setSelectedProcedureId(procedureId);
    setSelectedProcedureName(name);
    setScreen("procedure-submit");
  }, []);

  function goHome() {
    setScreen("home");
    setShowHelp(false);
    setShowTimeout(false);
  }

  function goIdle() {
    const activeSession = session;
    setSession(null);
    setScreen("idle");
    setShowHelp(false);
    setShowTimeout(false);
    if (activeSession) {
      sessionsApi.complete(activeSession.id).catch((error) => {
        console.error("Failed to complete kiosk session:", error);
      });
    }
  }

  function onServiceSelect(id: string) {
    const map: Record<string, Screen> = {
      submit: "auth",
      wallet: "copy-doc",
      queue: "queue",
      lookup: "lookup",
      ai: "ai",
      feedback: "feedback",
    };
    setScreen(map[id] ?? "home");
  }

  const common = { lang, onLangChange: setLang, onHome: goHome, onHelp: () => setShowHelp(true) };
  const isMaintenance = deviceConfig && (!deviceConfig.isEnabled || deviceConfig.status === "MAINTENANCE");

  return (
    <div style={{ width: "100vw", height: "100dvh", background: "#0F172A", overflow: "hidden", position: "relative" }}>
      <div ref={canvasRef} style={{ position: "absolute", width: 1920, height: 1080, overflow: "hidden" }}>
        {updating && (
          <div style={{ position: "absolute", inset: 0, zIndex: 100, background: "#0F172A", display: "grid", placeItems: "center", color: "#fff" }}>
            <div style={{ textAlign: "center", maxWidth: 560 }}>
              <div style={{ width: 64, height: 64, margin: "0 auto 28px", border: "5px solid rgba(255,255,255,.2)", borderTopColor: "#3B82F6", borderRadius: "50%", animation: "otaspin 1s linear infinite" }} />
              <div style={{ fontSize: 30, fontWeight: 800, marginBottom: 12 }}>Đang cập nhật hệ thống…</div>
              <div style={{ fontSize: 17, color: "#94A3B8", lineHeight: 1.6 }}>
                Vui lòng không tắt thiết bị. Kiosk sẽ tự khởi động lại sau khi cập nhật hoàn tất.
              </div>
            </div>
            <style>{`@keyframes otaspin { to { transform: rotate(360deg) } }`}</style>
          </div>
        )}
        {deviceConfig === undefined && <MaintenanceScreen connecting />}
        {deviceConfig === null && (
          <MaintenanceScreen error onRetry={() => {
            setDeviceConfig(undefined);
            setRetryNonce((value) => value + 1);
          }} />
        )}
        {isMaintenance && <MaintenanceScreen config={deviceConfig} />}

        {deviceConfig?.isEnabled && !isMaintenance && (
          <>
            {screen === "idle" && <IdleScreen onStart={startSession} tickerText={deviceConfig.tickerText} />}
            {startingSession && (
              <div style={{ position: "absolute", inset: 0, zIndex: 50, background: "rgba(15,23,42,.55)", display: "grid", placeItems: "center" }}>
                <div style={{ borderRadius: 20, background: "#fff", padding: "24px 34px", fontSize: 20, fontWeight: 800 }}>
                  Đang khởi tạo phiên làm việc...
                </div>
              </div>
            )}
            {screen === "home" && <HomeScreen {...common} onSelect={onServiceSelect} locationId={deviceConfig?.locationId} />}
            {screen === "auth" && <AuthScreen {...common} onBack={goHome} onDone={() => setScreen("profile")} />}
            {screen === "profile" && <ProfileScreen {...common} onBack={() => setScreen("auth")} onContinue={() => setScreen("discovery")} />}
            {screen === "discovery" && (
              <DiscoveryScreen {...common} onBack={() => setScreen("profile")} onSelectProcedure={handleSelectProcedure} onAI={() => setScreen("ai")} />
            )}
            {screen === "checklist" && (
              <ChecklistScreen {...common} onBack={() => setScreen("discovery")} onScan={() => setScreen("scan")} onContinue={() => setScreen("review")} />
            )}
            {screen === "scan" && <ScanScreen {...common} onBack={() => setScreen("checklist")} onDone={() => setScreen("checklist")} />}
            {screen === "review" && <ReviewScreen {...common} onBack={() => setScreen("checklist")} onSubmit={() => setScreen("procedure-submit")} />}
            {screen === "procedure-submit" && (
              <ProcedureSubmitScreen
                {...common}
                sessionId={session?.id}
                deviceSerial={deviceSerial ?? undefined}
                procedureId={selectedProcedureId ?? undefined}
                procedureName={selectedProcedureName || undefined}
                onBack={() => setScreen("discovery")}
                onComplete={() => setScreen("success")}
              />
            )}
            {screen === "success" && <SuccessScreen onHome={goIdle} />}
            {screen === "ai" && <AIScreen {...common} onBack={goHome} sessionId={session?.id} locationId={deviceConfig?.locationId} deviceId={deviceConfig?.deviceId} onStartProcedure={handleSelectProcedure} onStartCopyDoc={() => setScreen("copy-doc")} />}
            {screen === "copy-doc" && (
              <CopyDocScreen
                {...common}
                onBack={goHome}
                sessionId={session?.id}
                kioskDeviceId={deviceConfig?.id}
                deviceSerial={deviceSerial ?? undefined}
              />
            )}
            {screen === "queue" && (
              <QueueScreen {...common} onBack={goHome} sessionId={session?.id} kioskId={deviceConfig.id} locationId={deviceConfig.locationId} />
            )}
            {screen === "feedback" && session && (
              <FeedbackScreen {...common} sessionId={session.id} onComplete={goIdle} />
            )}
            {screen === "lookup" && <LookupScreen {...common} onBack={goHome} />}

            {showHelp && (
              <HelpOverlay onClose={() => setShowHelp(false)} onAI={() => {
                setShowHelp(false);
                setScreen("ai");
              }} />
            )}
            {showTimeout && !showHelp && (
              <TimeoutOverlay onContinue={() => {
                setShowTimeout(false);
                resetInactivity();
              }} onHome={goIdle} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

async function collectDeviceMetrics(): Promise<NativeMetrics> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<NativeMetrics>("collect_device_metrics");
  } catch {
    return {};
  }
}

async function loadDeviceSerial(): Promise<string> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const serial = await invoke<string>("get_device_serial");
    if (serial.trim()) return serial.trim();
  } catch {
    // Browser development mode uses the Next.js fallback endpoint.
  }

  const response = await fetch("/api/device");
  if (!response.ok) throw new Error(`Device identity request failed (${response.status})`);
  const data = await response.json() as { serial?: string };
  if (!data.serial?.trim()) throw new Error("Device identity is empty");
  return data.serial.trim();
}

function getOperatingSystem() {
  const platform = navigator.platform || "Unknown";
  if (/Win/i.test(platform)) return "Windows";
  if (/Mac/i.test(platform)) return "macOS";
  if (/Linux/i.test(platform)) return "Linux";
  return platform;
}

function getBrowserName() {
  const userAgent = navigator.userAgent;
  if (userAgent.includes("Edg/")) return "Microsoft Edge";
  if (userAgent.includes("Chrome/")) return "Chrome / WebView";
  if (userAgent.includes("Firefox/")) return "Firefox";
  if (userAgent.includes("Safari/")) return "Safari";
  return "Unknown";
}
