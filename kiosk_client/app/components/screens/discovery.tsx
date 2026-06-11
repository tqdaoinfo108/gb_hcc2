"use client";
import React, { useState, useEffect, useMemo } from "react";
import { TopBar, PageHeader } from "../ui";
import { Icon } from "../icons";
import { proceduresApi, CategoryGroup, ProcedureInCategory } from "../../lib/api";

interface Props {
  lang: "vi" | "en";
  onLangChange: (l: "vi" | "en") => void;
  onBack: () => void;
  onHome: () => void;
  onHelp: () => void;
  /** Called with the selected procedure (DB id) + whether it can be submitted online */
  onSelectProcedure: (procedureId: string, online: boolean, name: string) => void;
  onAI: () => void;
}

/* Map category code → icon name in our icon set (fallback to "doc") */
const CAT_ICON: Record<string, string> = {
  HOTICH: "hotich", CUTRU: "cutru", CCCD: "cccd", CHUNGTHUC: "chungthuc",
  DATDAI: "datdai", KINHDOANH: "kinhdoanh",
};

export function DiscoveryScreen({ lang, onLangChange, onBack, onHome, onHelp, onSelectProcedure, onAI }: Props) {
  const [search, setSearch] = useState("");
  const [groups, setGroups] = useState<CategoryGroup[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    proceduresApi.grouped()
      .then(g => { setGroups(g); setOpenId(g[0]?.id ?? null); })
      .catch(() => setErr(true));
  }, []);

  /* Filter procedures by search; auto-expand matching categories */
  const filtered = useMemo(() => {
    if (!groups) return [];
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map(g => ({ ...g, procedures: g.procedures.filter(p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)) }))
      .filter(g => g.procedures.length > 0);
  }, [groups, search]);

  useEffect(() => {
    if (search.trim() && filtered.length > 0) setOpenId(filtered[0].id);
  }, [search, filtered]);

  return (
    <div style={{ width: 1920, height: 1080, display: "flex", flexDirection: "column", background: "var(--ink-8)" }}>
      <TopBar lang={lang} onLangChange={onLangChange} onHome={onHome} onHelp={onHelp}
        title="Chọn thủ tục" subtitle="Chạm vào nhóm để xem danh sách thủ tục" />
      <PageHeader title="" onBack={onBack} step={2} totalSteps={3} />

      <div style={{ flex: 1, display: "flex", gap: 28, padding: "0 48px 40px", minHeight: 0 }}>
        {/* Left: search + accordion list */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20, minHeight: 0 }}>
          {/* Search */}
          <div style={{
            display: "flex", alignItems: "center", gap: 16,
            background: "#fff", borderRadius: 16, border: "1.5px solid var(--ink-7)",
            padding: "0 24px", height: 68, boxShadow: "var(--shadow-sm)", flexShrink: 0,
          }}>
            <Icon name="search" size={24} style={{ color: "var(--ink-4)", flexShrink: 0 }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Nhập tên thủ tục hoặc từ khóa..."
              style={{ flex: 1, border: "none", outline: "none", fontSize: 18, color: "var(--ink-1)", background: "transparent", fontFamily: "inherit" }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ color: "var(--ink-4)", cursor: "pointer" }}>
                <Icon name="x" size={20} />
              </button>
            )}
          </div>

          {/* Accordion */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, paddingRight: 6 }}>
            {!groups && !err && (
              <div style={{ textAlign: "center", padding: 60, color: "var(--ink-4)", fontSize: 16 }}>Đang tải danh mục…</div>
            )}
            {err && (
              <div style={{ textAlign: "center", padding: 60, color: "var(--red)", fontSize: 16 }}>Không tải được danh mục thủ tục.</div>
            )}
            {groups && filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: "var(--ink-4)", fontSize: 16 }}>Không tìm thấy thủ tục phù hợp.</div>
            )}

            {filtered.map(cat => {
              const open = openId === cat.id;
              const iconName = CAT_ICON[cat.code] ?? "doc";
              return (
                <div key={cat.id} style={{ background: "#fff", borderRadius: 20, border: `2px solid ${open ? "var(--blue)" : "var(--ink-7)"}`, overflow: "hidden", boxShadow: "var(--shadow-sm)", transition: "border-color .2s" }}>
                  {/* Title — expand/collapse only, NOT selectable as a procedure */}
                  <button
                    onClick={() => setOpenId(open ? null : cat.id)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 18,
                      padding: "22px 26px", cursor: "pointer", textAlign: "left",
                      background: open ? "var(--blue-lt)" : "#fff", border: "none",
                    }}
                  >
                    <div style={{ width: 52, height: 52, borderRadius: 14, flexShrink: 0, background: open ? "#fff" : "var(--ink-8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name={iconName} size={26} style={{ color: open ? "var(--blue)" : "var(--ink-3)" }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: .5, textTransform: "uppercase", color: open ? "var(--blue)" : "var(--ink-4)", marginBottom: 2 }}>Danh mục hồ sơ</div>
                      <div style={{ fontSize: 21, fontWeight: 800, color: open ? "var(--blue)" : "var(--ink-0)" }}>{cat.name}</div>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink-4)", padding: "4px 12px", borderRadius: 999, background: open ? "#fff" : "var(--ink-8)" }}>
                      {cat.procedures.length} thủ tục
                    </div>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: open ? "var(--blue)" : "var(--ink-8)", transform: open ? "rotate(180deg)" : "none", transition: "transform .25s" }}>
                      <Icon name="arrow" size={18} style={{ color: open ? "#fff" : "var(--ink-3)", transform: "rotate(90deg)" }} />
                    </div>
                  </button>

                  {/* Procedure list */}
                  {open && (
                    <div style={{ padding: "8px 18px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                      {cat.procedures.map(p => (
                        <ProcedureRow key={p.id} p={p} onSelect={() => onSelectProcedure(p.id, p.online, p.name)} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: AI helper */}
        <div style={{ width: 380, display: "flex", flexDirection: "column", gap: 16, flexShrink: 0 }}>
          <div className="card" style={{ flex: 1, padding: "28px", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--purple-lt)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon name="ai" size={24} style={{ color: "var(--purple)" }} />
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "var(--ink-0)" }}>Không tìm thấy?</div>
                <div style={{ fontSize: 13, color: "var(--ink-4)" }}>Hỏi trợ lý ảo để được hướng dẫn</div>
              </div>
            </div>
            <p style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.6 }}>
              Mô tả việc bạn cần làm bằng lời nói thường ngày — trợ lý sẽ tìm đúng thủ tục và hướng dẫn bạn nộp hồ sơ ngay tại kiosk.
            </p>
            <button className="btn btn-soft btn-md" onClick={onAI} style={{ marginTop: "auto", gap: 10 }}>
              <Icon name="mic" size={18} style={{ color: "var(--blue)" }} />
              Hỏi Trợ lý ảo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProcedureRow({ p, onSelect }: { p: ProcedureInCategory; onSelect: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onSelect}
      onPointerEnter={() => setHov(true)}
      onPointerLeave={() => setHov(false)}
      style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "18px 20px", borderRadius: 14, cursor: "pointer", textAlign: "left",
        background: hov ? "var(--blue-lt)" : "var(--ink-8)",
        border: `1.5px solid ${hov ? "var(--blue)" : "var(--ink-7)"}`,
        transition: "all .15s",
      }}
    >
      <div style={{ width: 42, height: 42, borderRadius: 11, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon name="doc" size={20} style={{ color: hov ? "var(--blue)" : "var(--ink-3)" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ink-0)", marginBottom: 3 }}>{p.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-4)" }}>
          <span>{p.slaWorkDays} ngày làm việc</span>
          <span>·</span>
          <span>{p.fee > 0 ? `${p.fee.toLocaleString("vi-VN")}đ` : "Miễn phí"}</span>
        </div>
      </div>
      {p.online ? (
        <span style={{ fontSize: 12, fontWeight: 700, padding: "5px 12px", borderRadius: 999, background: "var(--green-lt)", color: "var(--green)", flexShrink: 0 }}>
          Nộp trực tuyến
        </span>
      ) : (
        <span style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 999, background: "var(--ink-7)", color: "var(--ink-4)", flexShrink: 0 }}>
          Tại quầy
        </span>
      )}
      <Icon name="arrow" size={18} style={{ color: hov ? "var(--blue)" : "var(--ink-5)", flexShrink: 0 }} />
    </button>
  );
}
