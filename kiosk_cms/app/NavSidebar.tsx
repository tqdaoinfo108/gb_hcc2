"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState, useEffect } from "react";

/* ── Navigation tree structure ─────────────────────── */
interface NavItem {
  label: string;
  href: string;
  icon: string;
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
      { label: "Dashboard",    href: "/",          icon: "📊" },
    ],
  },
  {
    label: "Kiosk",
    icon: "🖥️",
    items: [
      { label: "Màn hình Home",  href: "/home-services", icon: "🏠" },
      { label: "Thiết bị",       href: "/devices",       icon: "🖥️" },
      { label: "Địa điểm",       href: "/kiosk-locations", icon: "📍" },
      { label: "OTA Update",     href: "/ota",            icon: "📡" },
      { label: "Remote Debug",   href: "/remote-debug",  icon: "🔧" },
    ],
  },
  {
    label: "Hàng đợi",
    icon: "🎟️",
    items: [
      { label: "Dịch vụ & quầy", href: "/queue",      icon: "🎟️" },
    ],
  },
  {
    label: "Dịch vụ công",
    icon: "📋",
    items: [
      { label: "Hồ sơ",        href: "/applications",          icon: "📋" },
      { label: "Thủ tục",      href: "/procedures",            icon: "📄" },
      { label: "Danh mục",     href: "/procedures/categories", icon: "🗂️" },
      { label: "Quy trình",    href: "/workflows",             icon: "⚙️" },
      { label: "Công dân",     href: "/citizens",              icon: "👤" },
    ],
  },
  {
    label: "Sao y tài liệu",
    icon: "📋",
    items: [
      { label: "Tổng quan",       href: "/copy-doc",              icon: "📊" },
      { label: "Loại giấy tờ",    href: "/copy-doc/categories",   icon: "🗂️" },
      { label: "Yêu cầu sao y",   href: "/copy-doc/requests",     icon: "📄" },
    ],
  },
  {
    label: "AI & Nội dung",
    icon: "🤖",
    items: [
      { label: "Trợ lý AI",   href: "/ai-monitor", icon: "🤖" },
      { label: "Phản hồi",    href: "/feedback",   icon: "⭐" },
      { label: "Bộ chọn",     href: "/selectors",  icon: "🎛️" },
    ],
  },
  {
    label: "Hệ thống",
    icon: "🔐",
    items: [
      { label: "Người dùng", href: "/users", icon: "🔐" },
    ],
  },
];

/* Check if a route is "active" — exact for dashboard, prefix for others */
function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/* Check if any child of a group is active */
function groupHasActive(group: NavGroup, pathname: string): boolean {
  return group.items.some(item => isActive(item.href, pathname));
}

/* ═══════════════════════════════════════════════════ */
export function NavSidebar() {
  const pathname = usePathname();

  /* initialise open state: groups with an active child start open */
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      NAV.map(g => [g.label, groupHasActive(g, pathname)]),
    ),
  );

  /* when route changes keep the relevant group open */
  useEffect(() => {
    setOpen(prev => {
      const next = { ...prev };
      NAV.forEach(g => {
        if (groupHasActive(g, pathname)) next[g.label] = true;
      });
      return next;
    });
  }, [pathname]);

  function toggle(label: string) {
    setOpen(prev => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <nav className="grid gap-0.5">
      {NAV.map(group => {
        const isGroupOpen   = !!open[group.label];
        const hasActiveChild = groupHasActive(group, pathname);

        /* Groups with only 1 item render inline without a header */
        if (group.items.length === 1) {
          const item = group.items[0];
          const active = isActive(item.href, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold
                          transition-colors
                          ${active
                            ? "bg-blue-600 text-white shadow-sm"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                          }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        }

        return (
          <div key={group.label} className="mb-0.5">
            {/* Group header */}
            <button
              onClick={() => toggle(group.label)}
              className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold
                          uppercase tracking-wider transition-colors
                          ${hasActiveChild
                            ? "text-blue-700"
                            : "text-slate-400 hover:text-slate-600"
                          }`}
            >
              {/* Expand chevron */}
              <span
                className="text-[10px] transition-transform duration-200"
                style={{ transform: isGroupOpen ? "rotate(90deg)" : "rotate(0deg)" }}
              >
                ▶
              </span>
              <span className="leading-none">{group.icon}</span>
              <span className="flex-1 text-left">{group.label}</span>
              {/* Active indicator dot */}
              {hasActiveChild && (
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              )}
            </button>

            {/* Children */}
            {isGroupOpen && (
              <div className="ml-3 mt-0.5 border-l-2 border-slate-100 pl-2.5 grid gap-0.5">
                {group.items.map(item => {
                  const active = isActive(item.href, pathname);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm
                                  font-semibold transition-colors
                                  ${active
                                    ? "bg-blue-50 text-blue-700"
                                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                  }`}
                    >
                      {/* Active left bar (needs relative on parent) */}
                      {active && (
                        <span className="absolute -left-[14px] top-1/2 -translate-y-1/2
                                         h-5 w-0.5 rounded-full bg-blue-500" />
                      )}
                      <span className="text-sm leading-none">{item.icon}</span>
                      <span className="flex-1">{item.label}</span>
                      {active && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
