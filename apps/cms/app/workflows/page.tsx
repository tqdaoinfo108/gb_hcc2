import { prisma } from "../lib/prisma";
import { EmptyState, PageHeader } from "../components";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const workflows = await prisma.workflow.findMany({
    orderBy: { updatedAt: "desc" },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 5 } }
  });

  return (
    <div>
      <PageHeader title="Workflow Editor" description="Cloud-hosted workflow definitions and versions consumed by kiosk automation." />
      {workflows.length === 0 ? (
        <EmptyState title="No workflows" detail="Create workflow records through the Workflow API or CMS form integration." />
      ) : (
        <div className="grid gap-4">
          {workflows.map((workflow) => (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={workflow.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">{workflow.name}</h2>
                  <p className="text-sm text-slate-500">{workflow.slug}</p>
                </div>
                <p className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                  Active {workflow.activeVersion ?? "None"}
                </p>
              </div>
              <div className="mt-4 grid gap-2">
                {workflow.versions.map((version) => (
                  <div className="rounded-xl border border-slate-200 p-3 text-sm" key={version.id}>
                    {version.version} | {version.status} | active {version.isActive ? "yes" : "no"}
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
