import { prisma } from "../lib/prisma";
import { EmptyState, PageHeader } from "../components";

export const dynamic = "force-dynamic";

export default async function RemoteDebugPage() {
  const sessions = await prisma.automationSession.findMany({
    orderBy: { startedAt: "desc" },
    include: {
      device: true,
      logs: { take: 5, orderBy: { createdAt: "desc" } }
    }
  });

  return (
    <div>
      <PageHeader title="Remote Debug" description="Current browser state, workflow step, screenshots, DOM evidence, and retry context from automation logs." />
      {sessions.length === 0 ? (
        <EmptyState title="No automation sessions" detail="Remote debug data is created by kiosk automation sessions." />
      ) : (
        <div className="grid gap-4">
          {sessions.map((session) => (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={session.id}>
              <h2 className="text-lg font-bold">{session.device?.deviceId ?? "Unknown device"}</h2>
              <p className="text-sm text-slate-500">Status {session.status} | current step {session.currentStep ?? "No current step"}</p>
              <div className="mt-4 grid gap-2">
                {session.logs.map((log) => (
                  <div className="rounded-xl border border-slate-200 p-3 text-sm" key={log.id}>
                    {log.level} | {log.stepKey ?? "session"} | {log.message}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
