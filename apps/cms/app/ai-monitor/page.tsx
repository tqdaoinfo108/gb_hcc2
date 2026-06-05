import { prisma } from "../lib/prisma";
import { EmptyState, PageHeader } from "../components";

export const dynamic = "force-dynamic";

export default async function AiMonitorPage() {
  const conversations = await prisma.aiConversation.findMany({
    orderBy: { createdAt: "desc" },
    include: { session: { include: { device: true } } }
  });

  return (
    <div>
      <PageHeader title="AI Monitor" description="Citizen questions, workflow state, automation error context, and assistant instruction history." />
      {conversations.length === 0 ? (
        <EmptyState title="No AI conversations" detail="AI guidance rows will appear when kiosk users ask for help." />
      ) : (
        <div className="grid gap-4">
          {conversations.map((item) => (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={item.id}>
              <p className="text-sm text-slate-500">{item.session?.device?.deviceId ?? "No device"} | {item.createdAt.toISOString()}</p>
              <h2 className="mt-2 text-lg font-bold">{item.userQuestion}</h2>
              <p className="mt-3 text-sm text-slate-700">{item.assistantInstruction}</p>
              <p className="mt-2 text-xs font-bold text-[rgb(154,75,45)]">{item.nextAction ?? "No next action stored"}</p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
