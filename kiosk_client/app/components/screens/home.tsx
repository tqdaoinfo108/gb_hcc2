"use client";
import React, { useState, useEffect } from "react";
import { TopBar } from "../ui";
import { Icon } from "../icons";
import { homeServicesApi, HomeServiceData } from "../../lib/api";
import { SERVICE_CARDS, ServiceId } from "../data";

interface Props {
  lang: "vi" | "en";
  onLangChange: (l: "vi" | "en") => void;
  onSelect: (id: ServiceId) => void;
  onHelp: () => void;
  onHome: () => void;
  locationId?: string;
}

/* Build a lookup from static SERVICE_CARDS for fallback label/sub */
const STATIC_MAP = Object.fromEntries(SERVICE_CARDS.map(s => [s.id, s]));

/* Resolve CSS variable colors to a displayable value; keep as-is if not a var() */
function resolveColor(val: string | null | undefined, fallback: string): string {
  return val ?? fallback;
}

export function HomeScreen({ lang, onLangChange, onSelect, onHelp, onHome, locationId }: Props) {
  const [hov, setHov] = useState<string | null>(null);
  const [services, setServices] = useState<HomeServiceData[] | null>(null);

  useEffect(() => {
    homeServicesApi.getVisible(locationId)
      .then(data => setServices(data))
      .catch(() => setServices(null)); // fall back to static cards on error
  }, [locationId]);

  /* If API has returned data use it; otherwise fall back to hardcoded SERVICE_CARDS */
  const cards: Array<{
    id: string;
    label: string;
    sub: string;
    icon: string;
    color: string;
    bg: string;
    badge: string | null;
    screenId: string;
  }> = services
    ? services.map(svc => {
        const fallback = STATIC_MAP[svc.screenId as ServiceId];
        return {
          id: svc.id,
          label: svc.name,
          sub: svc.description ?? fallback?.sub ?? "",
          icon: svc.icon ?? fallback?.icon ?? "submit",
          color: resolveColor(svc.colorHex, fallback?.color ?? "var(--blue)"),
          bg: resolveColor(svc.bgColorHex, fallback?.bg ?? "var(--blue-lt)"),
          badge: svc.badge,
          screenId: svc.screenId,
        };
      })
    : SERVICE_CARDS.map(s => ({
        id: s.id,
        label: s.label,
        sub: s.sub,
        icon: s.icon,
        color: s.color,
        bg: s.bg,
        badge: s.badge,
        screenId: s.id,
      }));

  /* Dynamic grid: ≤3 cols, max 2 rows */
  const cols = Math.min(cards.length, 3);

  return (
    <div style={{ width: 1920, height: 1080, display: "flex", flexDirection: "column", background: "var(--ink-8)" }}>
      <TopBar lang={lang} onLangChange={onLangChange} onHome={onHome} onHelp={onHelp} />

      {/* Body */}
      <div style={{ flex: 1, padding: "32px 48px 36px", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Section label */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 5, height: 24, borderRadius: 3, background: "var(--blue)" }} />
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-3)" }}>
            Chọn dịch vụ
          </span>
        </div>

        {/* Card grid */}
        <div style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: 20,
        }}>
          {cards.map((svc) => {
            const isHov = hov === svc.id;
            return (
              <button
                key={svc.id}
                onClick={() => onSelect(svc.screenId as ServiceId)}
                onPointerEnter={() => setHov(svc.id)}
                onPointerLeave={() => setHov(null)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "flex-start",
                  padding: "32px 36px", borderRadius: 24,
                  background: "#fff",
                  border: `2px solid ${isHov ? svc.color : "var(--ink-7)"}`,
                  cursor: "pointer", textAlign: "left", position: "relative", overflow: "hidden",
                  boxShadow: isHov ? `0 8px 32px rgba(0,0,0,.1), 0 0 0 2px ${svc.color}20` : "var(--shadow-sm)",
                  transform: isHov ? "translateY(-3px)" : "none",
                  transition: "all .25s cubic-bezier(0.34,1.56,0.64,1)",
                }}
              >
                {/* Left accent bar */}
                <div style={{
                  position: "absolute", left: 0, top: 0, bottom: 0, width: 6,
                  background: isHov ? svc.color : "transparent",
                  borderRadius: "24px 0 0 24px",
                  transition: "background .2s",
                }} />

                {/* Icon */}
                <div style={{
                  width: 72, height: 72, borderRadius: 18, marginBottom: 20,
                  background: isHov ? svc.color : svc.bg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "background .25s",
                  flexShrink: 0,
                }}>
                  <Icon name={svc.icon} size={36} style={{ color: isHov ? "#fff" : svc.color }} />
                </div>

                {/* Badge */}
                {svc.badge && (
                  <div style={{
                    position: "absolute", top: 24, right: 28,
                    background: svc.color, color: "#fff",
                    fontSize: 13, fontWeight: 700, padding: "4px 12px", borderRadius: 999,
                  }}>
                    {svc.badge}
                  </div>
                )}

                {/* Text */}
                <div style={{ fontSize: 26, fontWeight: 800, color: isHov ? svc.color : "var(--ink-0)", letterSpacing: "-.01em", lineHeight: 1.2, marginBottom: 8 }}>
                  {svc.label}
                </div>
                <div style={{ fontSize: 15, color: "var(--ink-4)", lineHeight: 1.5 }}>{svc.sub}</div>

                {/* Arrow */}
                <div style={{
                  position: "absolute", bottom: 28, right: 28,
                  width: 40, height: 40, borderRadius: "50%",
                  background: isHov ? svc.color : "var(--ink-8)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all .25s cubic-bezier(0.34,1.56,0.64,1)",
                }}>
                  <Icon name="arrow" size={18} style={{ color: isHov ? "#fff" : "var(--ink-4)" }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
