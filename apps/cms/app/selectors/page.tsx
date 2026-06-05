import { prisma } from "../lib/prisma";
import { EmptyState, PageHeader } from "../components";

export const dynamic = "force-dynamic";

export default async function SelectorsPage() {
  const selectors = await prisma.selector.findMany({
    orderBy: { createdAt: "desc" },
    include: { versions: { orderBy: { createdAt: "desc" } } }
  });

  return (
    <div>
      <PageHeader title="Selector Editor" description="Selector priority and version history for website changes without kiosk deployment." />
      {selectors.length === 0 ? (
        <EmptyState title="No selectors" detail="Selectors will appear after the CMS or API creates them." />
      ) : (
        <div className="grid gap-4">
          {selectors.map((selector) => (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={selector.id}>
              <h2 className="text-lg font-bold">{selector.selectorKey ?? selector.stepKey}</h2>
              <p className="text-sm text-slate-500">{selector.selectorType ?? "No active selector"} | priority {selector.priority}</p>
              <div className="mt-4 grid gap-2">
                {selector.versions.map((version) => (
                  <div className="rounded-xl border border-slate-200 p-3 text-sm" key={version.id}>
                    {version.version} | {version.selectorType} | priority {version.priority} | active {version.isActive ? "yes" : "no"}
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
