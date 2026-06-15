"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect, useMemo } from "react";

/* ── Navigation tree structure ─────────────────────── */
interface NavItem {
  label: string;
  href: string;
  icon: string;
  module: string; // gates visibility by the user's allowed modules
}
interface NavGroup {
  label: string;
  icon: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: "Tổng quan",
    icon: "📊",
    items: [
      { label: "Dashboard", href: "/", icon: "📊", module: "dashboard" },
    ],
  },
  {
    // Root-level: locations are the top of the org hierarchy — 1 location → many kiosks.
    label: "Địa điểm",
    icon: "📍",
    items: [
      { label: "Địa điểm", href: "/kiosk-locations", icon: "📍", module: "locations" },
    ],
  },
  {
    label: "Kiosk",
    icon: "🖥️",
    items: [
      { label: "Màn hình Home", href: "/home-services", icon: "🏠", module: "home_services" },
      { label: "Thiết bị", href: "/devices", icon: "🖥️", module: "devices" },
      { label: "OTA Update", href: "/ota", icon: "📡", module: "ota" },
      { label: "Điều khiển từ xa", href: "/remote-debug", icon: "🔧", module: "remote_debug" },
    ],
  },
  {
    label: "Hàng đợi",
    icon: "🎟️",
    items: [
      { label: "Dịch vụ & quầy", href: "/queue", icon: "🎟️", module: "queue" },
    ],
  },
  {
    label: "Dịch vụ công",
    icon: "📋",
    items: [
      { label: "Hồ sơ", href: "/applications", icon: "📋", module: "applications" },
      { label: "Thủ tục", href: "/procedures", icon: "📄", module: "procedures" },
      { label: "Danh mục", href: "/procedures/categories", icon: "🗂️", module: "procedures" },
      { label: "Quy trình", href: "/workflows", icon: "⚙️", module: "workflows" },
      { label: "Công dân", href: "/citizens", icon: "👤", module: "citizens" },
    ],
  },
  {
    label: "Sao y tài liệu",
    icon: "📋",
    items: [
      { label: "Tổng quan", href: "/copy-doc", icon: "📊", module: "copydoc" },
      { label: "Loại giấy tờ", href: "/copy-doc/categories", icon: "🗂️", module: "copydoc" },
      { label: "Yêu cầu sao y", href: "/copy-doc/requests", icon: "📄", module: "copydoc" },
    ],
  },
  {
    label: "AI & Nội dung",
    icon: "🤖",
    items: [
      { label: "Trợ lý AI", href: "/ai-monitor", icon: "🤖", module: "ai" },
      { label: "Phản hồi", href: "/feedback", icon: "⭐", module: "feedback" },
      { label: "Bộ chọn", href: "/selectors", icon: "🎛️", module: "selectors" },
    ],
  },
  {
    label: "Hệ thống",
    icon: "🔐",
    items: [
      { label: "Người dùng", href: "/users", icon: "🔐", module: "users" },
      { label: "Nhật ký hệ thống", href: "/audit", icon: "📜", module: "audit" },
    ],
  },
];

const PRIMARY = "#0068B7";

/**
 * Resolve the SINGLE active route — the longest href that the current path
 * matches. This prevents "/procedures" and "/procedures/categories" from both
 * lighting up (longest-prefix-wins). "/" only matches an exact pathname.
 */
function useActiveHref(pathname: string): string {
  return useMemo(() => {
    let best = "";
    for (const group of NAV) {
      for (const item of group.items) {
        if (item.href === "/") continue; // handled below
        if (pathname === item.href || pathname.startsWith(item.href + "/")) {
          if (item.href.length > best.length) best = item.href;
        }
      }
    }
    if (!best && pathname === "/") best = "/";
    return best;
  }, [pathname]);
}

/* ═══════════════════════════════════════════════════ */
export function NavSidebar({ modules }: { modules?: string[] }) {
  const pathname = usePathname();
  const activeHref = useActiveHref(pathname);
  const isActive = (href: string) => href === activeHref;

  /* Filter the nav by the user's allowed modules (undefined = show all). */
  const allowed = modules == null ? null : new Set(modules);
  const nav: NavGroup[] = (allowed
    ? NAV.map(g => ({ ...g, items: g.items.filter(it => allowed.has(it.module)) })).filter(g => g.items.length > 0)
    : NAV);

  const groupHasActive = (g: NavGroup) => g.items.some(it => isActive(it.href));

  /* Groups start OPEN on every page load (user preference). Still collapsible. */
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NAV.map(g => [g.label, true])),
  );

  /* Whenever the route changes, make sure the active group is open. */
  useEffect(() => {
    setOpen(prev => {
      const next = { ...prev };
      NAV.forEach(g => { if (groupHasActive(g)) next[g.label] = true; });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggle = (label: string) =>
    setOpen(prev => ({ ...prev, [label]: !prev[label] }));

  /* Shared item renderer (used for single + grouped items) */
  function ItemLink({ item }: { item: NavItem; nested?: boolean }) {
    const active = isActive(item.href);
    return (
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={`group relative flex items-center gap-2.5 rounded-xl py-2 pl-3 pr-3 text-sm
                    transition-colors duration-150
                    ${active
                      ? "font-semibold text-[#0068B7]"
                      : "font-medium text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"}`}
        style={active ? { background: "rgba(0,104,183,0.09)" } : undefined}
      >
        {/* Left accent bar */}
        <span
          className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full transition-all duration-150"
          style={{ background: active ? PRIMARY : "transparent" }}
        />
        {/* Icon chip */}
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[14px] leading-none transition-colors
                      ${active ? "bg-white shadow-sm ring-1 ring-[#0068B7]/15" : "bg-slate-100 group-hover:bg-white"}`}
        >
          {item.icon}
        </span>
        <span className="flex-1 truncate">{item.label}</span>
      </Link>
    );
  }

  return (
    <nav className="grid gap-1.5">
      {nav.map(group => {
        const isGroupOpen = !!open[group.label];
        const hasActiveChild = groupHasActive(group);

        /* Single-item groups render as a standalone link (no header) */
        if (group.items.length === 1) {
          return (
            <div key={group.label} className="mb-0.5">
              <ItemLink item={group.items[0]} />
            </div>
          );
        }

        return (
          <div key={group.label} className="mb-1">
            {/* Group header */}
            <button
              onClick={() => toggle(group.label)}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-[11px]
                         font-bold uppercase tracking-wider text-slate-400
                         transition-colors hover:text-slate-600"
            >
              <span
                className="text-[9px] text-slate-400 transition-transform duration-200"
                style={{ transform: isGroupOpen ? "rotate(90deg)" : "rotate(0deg)" }}
              >
                ▶
              </span>
              <span className="flex-1 text-left">{group.label}</span>
              {hasActiveChild && (
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: PRIMARY }} />
              )}
            </button>

            {/* Children with a vertical guide line */}
            <div
              className="overflow-hidden transition-all duration-200"
              style={{ maxHeight: isGroupOpen ? `${group.items.length * 48 + 8}px` : "0px" }}
            >
              <div className="ml-[18px] mt-1 grid gap-0.5 border-l border-slate-200 pl-2">
                {group.items.map(item => (
                  <ItemLink key={item.href} item={item} nested />
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
