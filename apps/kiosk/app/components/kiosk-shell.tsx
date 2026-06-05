"use client";

import { useEffect, useMemo, useState } from "react";
import { Countdown } from "./countdown";
import { DeviceHeartbeat } from "./device-heartbeat";

type KioskDeviceState = {
  deviceId: string;
  location: string;
  version: string;
  isLocked: boolean;
  latestStatus: {
    currentStep?: string | null;
    currentUrl?: string | null;
  } | null;
};

const serviceCards = [
  ["Cư trú & CCCD", "▣"],
  ["Hộ tịch", "▥"],
  ["Đất đai", "□"],
  ["Bảo hiểm", "♙"],
  ["Tư pháp", "◇"],
  ["Thuế & phí", "▤"]
];

const aiChips = [
  "Tôi không biết upload giấy tờ",
  "Thông tin của tôi có an toàn không?",
  "Bước này là gì?",
  "Tôi muốn nói chuyện với cán bộ"
];

async function fetchDevice(deviceId: string): Promise<KioskDeviceState | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:4000";
  try {
    const response = await fetch(`${apiUrl}/devices/${encodeURIComponent(deviceId)}`);
    if (!response.ok) {
      return null;
    }
    const text = await response.text();
    if (!text.trim()) {
      return null;
    }
    return JSON.parse(text) as KioskDeviceState | null;
  } catch {
    return null;
  }
}

export function KioskShell() {
  const deviceId = process.env.NEXT_PUBLIC_KIOSK_DEVICE_ID ?? "unregistered";
  const [device, setDevice] = useState<KioskDeviceState | null>(null);
  const [fontScale, setFontScale] = useState(1);

  useEffect(() => {
    let active = true;
    async function load() {
      const nextDevice = await fetchDevice(deviceId);
      if (active) {
        setDevice(nextDevice);
      }
    }
    void load();
    const interval = window.setInterval(load, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [deviceId]);

  const currentStep = device?.latestStatus?.currentStep ?? "Mở Cổng Dịch vụ công";
  const currentUrl = device?.latestStatus?.currentUrl ?? "https://dichvucong.gov.vn";
  const locked = Boolean(device?.isLocked);
  const location = device?.location ?? "UBND Phường Cửa Nam · Quầy 03";
  const version = device?.version ?? "0.0.0";
  const stepLabel = useMemo(() => "Bước 1/8", []);

  return (
    <main className="kiosk-client" style={{ ["--font-scale" as string]: fontScale }}>
      <header className="kiosk-header">
        <div className="brand-block">
          <div className="brand-icon" aria-hidden="true">▦</div>
          <div>
            <h1>Kiosk Dịch vụ công</h1>
            <p>{location}</p>
          </div>
        </div>

        <div className="status-strip">
          <StatusPill label="Thiết bị" value="Hoạt động" state="ok" symbol="▱" />
          <StatusPill label="Kết nối" value="Ổn định" state="ok" symbol="⌁" />
          <Countdown compact />
          <button className="tool-button" type="button" onClick={() => setFontScale((value) => Math.max(0.92, value - 0.04))}>
            A-
          </button>
          <button className="tool-button" type="button" onClick={() => setFontScale((value) => Math.min(1.14, value + 0.04))}>
            A+
          </button>
          <button className="tool-button lang" type="button">VI</button>
        </div>
      </header>

      <section className="kiosk-main">
        <section className="browser-panel" aria-label="Browser automation view">
          {locked ? (
            <MaintenanceState />
          ) : (
            <>
              <div className="browser-toolbar">
                <div className="window-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
                <div className="url-chip">
                  <span className="lock-mark" aria-hidden="true">⌂</span>
                  <span>{currentUrl}</span>
                </div>
                <div className="engine-ready">
                  <span />
                  Sẵn sàng
                </div>
              </div>

              <div className="browser-viewport">
                <div className="dvc-topbar">
                  <span className="crest">★</span>
                  <strong>CỔNG DỊCH VỤ CÔNG QUỐC GIA</strong>
                  <nav>
                    <span>Trang chủ</span>
                    <span>Thủ tục</span>
                    <span>Hỗ trợ</span>
                  </nav>
                </div>

                <div className="dvc-hero">
                  <h2>Dịch vụ công trực tuyến</h2>
                  <p>Một cửa mọi thủ tục hành chính của bạn.</p>
                  <div className="search-row">
                    <span aria-hidden="true">⌕</span>
                    <span>Tìm thủ tục, dịch vụ...</span>
                    <button type="button">Tìm</button>
                  </div>
                </div>

                <div className="service-grid">
                  {serviceCards.map(([label, icon]) => (
                    <button className="service-card" type="button" key={label}>
                      <span aria-hidden="true">{icon}</span>
                      <strong>{label}</strong>
                    </button>
                  ))}
                </div>

                <div className="automation-cursor" aria-hidden="true" />
                <div className="automation-toast">
                  <span aria-hidden="true">✓</span>
                  Đang mở dichvucong.gov.vn
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="assistant-panel" aria-label="AI assistant">
          <div className="assistant-head">
            <div className="assistant-avatar" aria-hidden="true">✧</div>
            <div>
              <h2>Trợ lý ảo</h2>
              <p><span /> Đang hỗ trợ bạn</p>
            </div>
          </div>

          <div className="assistant-body">
            <div className="bubble ai">
              Tôi đang mở Cổng Dịch vụ công Quốc gia cho bạn. Bạn chỉ cần làm theo hướng dẫn nhé.
            </div>
          </div>

          <div className="assistant-chips">
            {aiChips.map((chip) => (
              <button type="button" key={chip}>{chip}</button>
            ))}
          </div>

          <form className="assistant-input">
            <input type="text" placeholder="Nhập câu hỏi của bạn..." aria-label="Nhập câu hỏi" />
            <button type="submit" aria-label="Gửi câu hỏi">➤</button>
          </form>
        </aside>
      </section>

      <footer className="kiosk-footer">
        <div className="progress-meta">
          <strong>{stepLabel}</strong>
          <span>{currentStep}</span>
        </div>
        <div className="progress-track" aria-label="Workflow progress">
          {Array.from({ length: 8 }).map((_, index) => (
            <span className={index === 0 ? "now" : ""} key={index} />
          ))}
        </div>
        <div className="footer-actions">
          <button className="help-button" type="button">Gọi cán bộ</button>
          <button className="continue-button" type="button">Tiếp tục</button>
        </div>
      </footer>

      <DeviceHeartbeat
        deviceId={deviceId}
        version={version}
        location={location}
        currentStep={currentStep}
      />
    </main>
  );
}

function StatusPill({
  label,
  value,
  state,
  symbol
}: {
  label: string;
  value: string;
  state: "ok" | "warn";
  symbol: string;
}) {
  return (
    <div className="status-pill">
      <span className="status-symbol" aria-hidden="true">{symbol}</span>
      <div>
        <p>{label}</p>
        <strong className={state}>{value}</strong>
      </div>
    </div>
  );
}

function MaintenanceState() {
  return (
    <div className="maintenance-state">
      <div>
        <p>Kiosk đang bảo trì</p>
        <span>Thiết bị đã bị khóa từ Control Center.</span>
      </div>
    </div>
  );
}
