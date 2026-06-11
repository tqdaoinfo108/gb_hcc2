"use client";

import { useState, useTransition } from "react";
import { cancelRequest } from "../actions";
import { EmptyState, Table, Td, fmt } from "../../components";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/* ── Status map ──────────────────────────────────────────── */
const STATUS_VI: Record<string, { label: string; bg: string; color: string }> = {
  INITIATED:        { label: "Khởi tạo",        bg: "#F1F5F9", color: "#64748B" },
  SCAN_PENDING:     { label: "Chờ chụp",         bg: "#FEF3C7", color: "#D97706" },
  SCAN_IN_PROGRESS: { label: "Đang chụp",        bg: "#DBEAFE", color: "#2563EB" },
  SCAN_COMPLETE:    { label: "Đã chụp",           bg: "#DBEAFE", color: "#2563EB" },
  AI_PROCESSING:    { label: "AI xử lý",          bg: "#EDE9FE", color: "#7C3AED" },
  PREVIEW_READY:    { label: "Xem trước",         bg: "#DBEAFE", color: "#2563EB" },
  ADJUSTED:         { label: "Đã căn chỉnh",      bg: "#DBEAFE", color: "#2563EB" },
  FEE_PENDING:      { label: "Chờ xác nhận phí",  bg: "#FEF3C7", color: "#D97706" },
  FEE_CONFIRMED:    { label: "Đã xác nhận phí",   bg: "#DCFCE7", color: "#16A34A" },
  GENERATING_PDF:   { label: "Đang tạo PDF",      bg: "#EDE9FE", color: "#7C3AED" },
  PRINT_QUEUED:     { label: "Chờ in",             bg: "#FEF3C7", color: "#D97706" },
  PRINTING:         { label: "Đang in",            bg: "#DBEAFE", color: "#2563EB" },
  COMPLETED:        { label: "Hoàn thành",         bg: "#DCFCE7", color: "#16A34A" },
  FAILED:           { label: "Thất bại",           bg: "#FEE2E2", color: "#DC2626" },
  CANCELLED:        { label: "Đã huỷ",             bg: "#F1F5F9", color: "#64748B" },
};

const TERMINAL = ["COMPLETED", "FAILED", "CANCELLED"];

function StatusChip({ status }: { status: string }) {
  const s = STATUS_VI[status] ?? { label: status, bg: "#F1F5F9", color: "#64748B" };
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

/* ── Types ───────────────────────────────────────────────── */
type ScanSession = {
  id: string; status: string; sessionToken: string;
  connectedAt: Date | null; uploadedAt: Date | null; expiresAt: Date;
  createdAt: Date;
};
type PrintJob = {
  id: string; status: string; copies: number;
  startedAt: Date | null; completedAt: Date | null; createdAt: Date;
  failReason?: string | null;
};
type Page = {
  id: string; pageIndex: number;
  rawImagePath: string; processedImagePath: string | null;
};
type Request = {
  id: string; requestCode: string; status: string;
  quantity: number; baseFee: number; processingFee: number; totalFee: number;
  detectedTypeLabel: string | null; detectedTypeConfidence: number | null;
  receiptCode: string | null; paymentRef: string | null;
  rawImagePath: string | null; processedImagePath: string | null; pdfPath: string | null;
  feeConfirmedAt: Date | null; completedAt: Date | null; createdAt: Date; updatedAt: Date;
  category: { id: string; name: string } | null;
  printJobs: PrintJob[];
  scanSessions: ScanSession[];
  pages: Page[];
};

/* ── Detail drawer ───────────────────────────────────────── */
function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-slate-100 pt-4">
      <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right font-semibold text-slate-800">{value ?? "—"}</span>
    </div>
  );
}

function DetailDrawer({ req, onClose, onCancel }: {
  req: Request;
  onClose: () => void;
  onCancel: (id: string) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const canCancel = !TERMINAL.includes(req.status);
  // DB stores storagePath as "copy-doc/filename.jpg"
  // NestJS serves uploads/ dir at /uploads/ prefix → full URL = API_URL + /uploads/ + storagePath
  function toSrc(p: string | null | undefined): string | null {
    if (!p) return null;
    if (p.startsWith("http")) return p;
    // strip any leading slash first
    const stripped = p.replace(/^\/+/, "");
    // if it already starts with "uploads/", don't double-add
    const withPrefix = stripped.startsWith("uploads/") ? `/${stripped}` : `/uploads/${stripped}`;
    return `${API_URL}${withPrefix}`;
  }

  const rawImageSrc       = toSrc(req.rawImagePath);
  const processedImageSrc = toSrc(req.processedImagePath);
  const pdfSrc            = toSrc(req.pdfPath);

  // Prefer the multi-page collection; fall back to legacy single image fields
  const displayPages: Page[] = (req.pages && req.pages.length > 0)
    ? req.pages
    : (req.rawImagePath
        ? [{ id: "legacy", pageIndex: 0, rawImagePath: req.rawImagePath, processedImagePath: req.processedImagePath }]
        : []);

  function handleCancel() {
    if (!confirm("Huỷ yêu cầu này?")) return;
    startTransition(async () => {
      await cancelRequest(req.id);
      onCancel(req.id);
    });
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-[440px] flex-col bg-white shadow-2xl"
        style={{ borderLeft: "1px solid #e2e8f0" }}>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-black text-slate-800">{req.requestCode}</span>
            <StatusChip status={req.status} />
          </div>
          <button onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors">
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Document pages — each page shows original + cropped */}
          {displayPages.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Tài liệu
                </p>
                <span className="text-[11px] font-semibold text-slate-500">
                  {displayPages.length} trang
                </span>
              </div>

              {displayPages.map((pg, i) => {
                const rawSrc  = toSrc(pg.rawImagePath);
                const procSrc = toSrc(pg.processedImagePath);
                return (
                  <div key={pg.id} className="rounded-xl border border-slate-100 p-2">
                    <div className="mb-2 flex items-center gap-2">
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-800 px-1.5 text-[10px] font-black text-white">
                        {i + 1}
                      </span>
                      <span className="text-xs font-semibold text-slate-600">
                        Trang {i + 1}{i === 0 ? " · xác định loại" : ""}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {/* Original */}
                      <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        <div className="relative" style={{ paddingBottom: "130%" }}>
                          {rawSrc
                            ? <img src={rawSrc} alt="Ảnh gốc"
                                className="absolute inset-0 h-full w-full object-cover"
                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            : <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-400">—</div>}
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                          <span className="text-[11px] font-semibold text-slate-500">Ảnh gốc</span>
                        </div>
                      </div>
                      {/* Processed / cropped */}
                      <div className={"overflow-hidden rounded-lg border-2 " + (procSrc ? "border-blue-200 bg-blue-50" : "border-dashed border-slate-200 bg-slate-50")}>
                        <div className="relative" style={{ paddingBottom: "130%" }}>
                          {procSrc
                            ? <>
                                <img src={procSrc} alt="Đã cắt"
                                  className="absolute inset-0 h-full w-full object-cover"
                                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                                <div className="absolute left-1.5 top-1.5">
                                  <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-black text-white shadow">In ra</span>
                                </div>
                              </>
                            : <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-400">Chưa cắt</div>}
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1.5">
                          <span className={"h-1.5 w-1.5 rounded-full " + (procSrc ? "bg-blue-500" : "bg-slate-300")} />
                          <span className={"text-[11px] font-semibold " + (procSrc ? "text-blue-700" : "text-slate-400")}>Đã cắt</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Core info */}
          <DetailSection title="Thông tin yêu cầu">
            <Row label="Mã yêu cầu"   value={<span className="font-mono text-xs">{req.requestCode}</span>} />
            <Row label="Tạo lúc"       value={fmt(req.createdAt)} />
            <Row label="Cập nhật"      value={fmt(req.updatedAt)} />
            {req.completedAt && <Row label="Hoàn thành" value={fmt(req.completedAt)} />}
            {req.receiptCode  && <Row label="Mã biên lai" value={<span className="font-mono text-xs">{req.receiptCode}</span>} />}
            {req.paymentRef   && <Row label="Ref thanh toán" value={<span className="font-mono text-xs">{req.paymentRef}</span>} />}
          </DetailSection>

          {/* Document type */}
          <DetailSection title="Loại giấy tờ">
            {req.category ? (
              <Row label="Danh mục" value={req.category.name} />
            ) : req.detectedTypeLabel ? (
              <div className="rounded-lg bg-purple-50 px-3 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-purple-700">{req.detectedTypeLabel}</span>
                  <span className="text-[11px] font-black text-purple-600">
                    {req.detectedTypeConfidence ? `${(req.detectedTypeConfidence * 100).toFixed(0)}%` : ""}
                  </span>
                </div>
                {req.detectedTypeConfidence && (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-purple-100">
                    <div className="h-full rounded-full bg-purple-500 transition-all"
                      style={{ width: `${(req.detectedTypeConfidence * 100).toFixed(0)}%` }} />
                  </div>
                )}
                <p className="mt-1.5 text-[10px] text-purple-500">Nhận diện bởi AI</p>
              </div>
            ) : (
              <p className="text-sm italic text-slate-400">Chờ nhận diện</p>
            )}
          </DetailSection>

          {/* Fee */}
          <DetailSection title="Phí dịch vụ">
            <Row label="Số bản in"    value={req.quantity} />
            <Row label="Phí cơ bản"   value={Number(req.baseFee) > 0 ? `${Number(req.baseFee).toLocaleString("vi-VN")}đ` : "—"} />
            <Row label="Phí xử lý"    value={Number(req.processingFee) > 0 ? `${Number(req.processingFee).toLocaleString("vi-VN")}đ` : "—"} />
            <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2.5">
              <span className="text-sm font-bold text-slate-600">Tổng cộng</span>
              <span className="text-base font-black text-slate-900">
                {Number(req.totalFee) > 0 ? `${Number(req.totalFee).toLocaleString("vi-VN")}đ` : "—"}
              </span>
            </div>
            {req.feeConfirmedAt && <Row label="Xác nhận lúc" value={fmt(req.feeConfirmedAt)} />}
          </DetailSection>

          {/* Scan sessions */}
          {req.scanSessions.length > 0 && (
            <DetailSection title={`Phiên quét (${req.scanSessions.length})`}>
              <div className="space-y-2">
                {req.scanSessions.map(s => (
                  <div key={s.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-slate-400 text-[10px]">{s.sessionToken.slice(0, 16)}…</span>
                      <span className="rounded-full px-2 py-0.5 font-bold"
                        style={{
                          background: s.status === "COMPLETE" ? "#DCFCE7" : s.status === "EXPIRED" ? "#FEE2E2" : "#DBEAFE",
                          color:      s.status === "COMPLETE" ? "#16A34A" : s.status === "EXPIRED" ? "#DC2626" : "#2563EB",
                        }}>
                        {s.status}
                      </span>
                    </div>
                    {s.connectedAt && <div className="text-slate-500">Kết nối: {fmt(s.connectedAt)}</div>}
                    {s.uploadedAt  && <div className="text-slate-500">Tải lên: {fmt(s.uploadedAt)}</div>}
                    <div className="text-slate-400">Hết hạn: {fmt(s.expiresAt)}</div>
                  </div>
                ))}
              </div>
            </DetailSection>
          )}

          {/* Print jobs */}
          {req.printJobs.length > 0 && (
            <DetailSection title={`Lệnh in (${req.printJobs.length})`}>
              <div className="space-y-2">
                {req.printJobs.map(j => (
                  <div key={j.id} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-slate-600 font-semibold">{j.copies} bản</span>
                      <span className="rounded-full px-2 py-0.5 font-bold"
                        style={{
                          background: j.status === "COMPLETED" ? "#DCFCE7" : j.status === "FAILED" ? "#FEE2E2" : "#DBEAFE",
                          color:      j.status === "COMPLETED" ? "#16A34A" : j.status === "FAILED" ? "#DC2626" : "#2563EB",
                        }}>
                        {j.status}
                      </span>
                    </div>
                    {j.startedAt   && <div className="text-slate-500">Bắt đầu: {fmt(j.startedAt)}</div>}
                    {j.completedAt && <div className="text-slate-500">Hoàn thành: {fmt(j.completedAt)}</div>}
                    {j.failReason  && <div className="mt-1 text-red-500">Lỗi: {j.failReason}</div>}
                  </div>
                ))}
              </div>
            </DetailSection>
          )}

          {/* Files */}
          {(rawImageSrc || processedImageSrc || pdfSrc) && (
            <DetailSection title="Tệp đính kèm">
              {rawImageSrc && (
                <a href={rawImageSrc} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors mb-2">
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  Ảnh gốc
                  <span className="ml-auto text-slate-400">↗</span>
                </a>
              )}
              {processedImageSrc && (
                <a href={processedImageSrc} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors mb-2">
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
                  Ảnh đã cắt (bản in)
                  <span className="ml-auto text-slate-400">↗</span>
                </a>
              )}
              {pdfSrc && (
                <a href={pdfSrc} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors">
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  Bản sao PDF
                  <span className="ml-auto text-slate-400">↗</span>
                </a>
              )}
            </DetailSection>
          )}

        </div>

        {/* Footer action */}
        {canCancel && (
          <div className="border-t border-slate-100 px-5 py-4">
            <button
              onClick={handleCancel}
              disabled={isPending}
              className="w-full rounded-xl border-2 border-red-200 bg-red-50 py-2.5 text-sm font-bold text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
            >
              {isPending ? "Đang huỷ…" : "Huỷ yêu cầu này"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}

/* ── Main client component ───────────────────────────────── */
export function RequestsClient({ requests }: { requests: Request[] }) {
  const [selected, setSelected] = useState<Request | null>(null);
  const [localRequests, setLocalRequests] = useState(requests);

  const active   = localRequests.filter(r => !TERMINAL.includes(r.status));
  const finished = localRequests.filter(r =>  TERMINAL.includes(r.status));

  function handleCancel(id: string) {
    setLocalRequests(prev =>
      prev.map(r => r.id === id ? { ...r, status: "CANCELLED" } : r)
    );
    setSelected(prev => prev?.id === id ? { ...prev, status: "CANCELLED" } : prev);
  }

  return (
    <div>
      {/* ── Active requests ── */}
      <h2 className="mb-4 text-lg font-black text-slate-900">
        Đang xử lý ({active.length})
      </h2>

      {active.length === 0 ? (
        <div className="mb-8">
          <EmptyState title="Không có yêu cầu đang xử lý"
            detail="Tất cả yêu cầu đã hoàn thành hoặc chưa có yêu cầu mới." />
        </div>
      ) : (
        <div className="mb-8">
          <Table headers={["Mã yêu cầu", "Loại giấy tờ", "Trạng thái", "Số bản", "Tổng phí", "AI nhận diện", "Thời gian", ""]}>
            {active.map(r => (
              <tr key={r.id}
                className="cursor-pointer border-t border-slate-100 hover:bg-blue-50 transition-colors"
                style={selected?.id === r.id ? { background: "#EFF6FF" } : {}}
                onClick={() => setSelected(r)}>
                <Td>
                  <span className="font-mono text-xs font-bold text-slate-800">{r.requestCode}</span>
                </Td>
                <Td bold>
                  {r.category?.name
                    ? <span>{r.category.name}</span>
                    : r.detectedTypeLabel
                      ? <span className="text-purple-700">{r.detectedTypeLabel} <span className="text-xs text-purple-400">(AI)</span></span>
                      : <span className="italic text-slate-400">Chờ nhận diện</span>
                  }
                </Td>
                <Td><StatusChip status={r.status} /></Td>
                <Td>{r.quantity}</Td>
                <Td>
                  <span className="font-bold">
                    {Number(r.totalFee) > 0
                      ? `${Number(r.totalFee).toLocaleString("vi-VN")}đ`
                      : "—"}
                  </span>
                </Td>
                <Td>
                  {r.detectedTypeConfidence ? (
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full rounded-full bg-purple-500"
                          style={{ width: `${(r.detectedTypeConfidence * 100).toFixed(0)}%` }} />
                      </div>
                      <span className="text-xs font-bold text-purple-700">
                        {(r.detectedTypeConfidence * 100).toFixed(0)}%
                      </span>
                    </div>
                  ) : <span className="text-xs text-slate-400">—</span>}
                </Td>
                <Td>{fmt(r.createdAt)}</Td>
                <Td>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
                    stroke={selected?.id === r.id ? "#2563EB" : "#CBD5E1"}
                    strokeWidth={2.5} strokeLinecap="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </Td>
              </tr>
            ))}
          </Table>
        </div>
      )}

      {/* ── Completed requests ── */}
      <h2 className="mb-4 text-lg font-black text-slate-900">
        Lịch sử ({finished.length})
      </h2>

      {finished.length === 0 ? (
        <EmptyState title="Chưa có yêu cầu đã hoàn thành" />
      ) : (
        <Table headers={["Mã yêu cầu", "Mã biên lai", "Loại giấy tờ", "Trạng thái", "Số bản", "Tổng phí", "Thời gian", ""]}>
          {finished.map(r => (
            <tr key={r.id}
              className="cursor-pointer border-t border-slate-100 hover:bg-slate-50 transition-colors"
              style={selected?.id === r.id ? { background: "#F8FAFC" } : {}}
              onClick={() => setSelected(r)}>
              <Td><span className="font-mono text-xs">{r.requestCode}</span></Td>
              <Td><span className="font-mono text-xs text-slate-500">{r.receiptCode ?? "—"}</span></Td>
              <Td bold>{r.category?.name ?? r.detectedTypeLabel ?? "—"}</Td>
              <Td><StatusChip status={r.status} /></Td>
              <Td>{r.quantity}</Td>
              <Td>
                {Number(r.totalFee) > 0
                  ? <span className="font-bold text-green-700">{Number(r.totalFee).toLocaleString("vi-VN")}đ</span>
                  : "—"}
              </Td>
              <Td>{fmt(r.createdAt)}</Td>
              <Td>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
                  stroke={selected?.id === r.id ? "#2563EB" : "#CBD5E1"}
                  strokeWidth={2.5} strokeLinecap="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </Td>
            </tr>
          ))}
        </Table>
      )}

      {/* ── Detail drawer ── */}
      {selected && (
        <DetailDrawer
          req={selected}
          onClose={() => setSelected(null)}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
