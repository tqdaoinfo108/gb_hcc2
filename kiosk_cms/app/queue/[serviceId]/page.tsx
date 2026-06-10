import { notFound } from "next/navigation";
import Link from "next/link";
import { getQueueServiceDetail } from "../../lib/data";
import { PageHeader, StatusBadge, fmt } from "../../components";
import { ServiceDetailClient } from "./ServiceDetailClient";

export const dynamic = "force-dynamic";

export default async function ServiceDetailPage({ params }: { params: Promise<{ serviceId: string }> }) {
  const { serviceId } = await params;
  const { service, waitingTickets } = await getQueueServiceDetail(serviceId);
  if (!service) notFound();

  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-sm text-slate-400">
        <Link href="/queue" className="hover:text-blue-600">Hàng đợi</Link>
        <span>/</span>
        <span className="text-slate-700 font-semibold">{service.name}</span>
      </div>

      <PageHeader
        title={service.name}
        description={`Tiền tố: ${service.prefix} · Số hiện tại: ${service.currentNumber} · Đang chờ: ${waitingTickets.length}`}
      />

      <ServiceDetailClient
        service={service as any}
        initialWaiting={waitingTickets as any}
      />
    </div>
  );
}
