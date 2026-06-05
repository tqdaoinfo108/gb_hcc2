import { EmptyState, StatusBadge } from "@smart-kiosk/ui";

export { EmptyState, StatusBadge };

export function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="mb-7">
      <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[rgb(154,75,45)]">
        Government digital service
      </p>
      <h1 className="text-3xl font-black tracking-tight text-slate-950">{title}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{description}</p>
    </header>
  );
}

export function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-3 text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}
