import type { ReactNode } from "react";

type CardProps = {
  title?: string;
  children: ReactNode;
  className?: string;
};

export function Card({ title, children, className = "" }: CardProps) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title ? <h2 className="mb-4 text-lg font-semibold text-slate-950">{title}</h2> : null}
      {children}
    </section>
  );
}

type EmptyStateProps = {
  title: string;
  detail: string;
};

export function EmptyState({ title, detail }: EmptyStateProps) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm">
      <p className="font-semibold text-slate-950">{title}</p>
      <p className="mt-2 text-slate-600">{detail}</p>
    </div>
  );
}

type StatusBadgeProps = {
  status: "online" | "offline" | "error" | "maintenance" | string;
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const tone =
    status === "online"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : status === "error"
        ? "bg-red-50 text-red-700 ring-red-200"
        : status === "maintenance"
          ? "bg-amber-50 text-amber-700 ring-amber-200"
          : "bg-slate-50 text-slate-700 ring-slate-200";

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${tone}`}>
      {status}
    </span>
  );
}
