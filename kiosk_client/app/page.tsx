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
import { deviceApi, KioskRuntimeConfig, KioskSessionData, sessionsApi } from "./lib/api";

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

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION?.trim() || "1.0.0";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const INACTIVITY_MS = 180_000;
const HEARTBEAT_MS = 15_000;

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
            {screen === "home" && <HomeScreen {...common} onSelect={onServiceSelect} />}
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
            {screen === "ai" && <AIScreen {...common} onBack={goHome} />}
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
              <QueueScreen {...common} onBack={goHome} sessionId={session?.id} kioskId={deviceConfig.id} />
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
