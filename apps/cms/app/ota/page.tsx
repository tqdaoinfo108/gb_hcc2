import { prisma } from "../lib/prisma";
import { EmptyState, PageHeader } from "../components";

export const dynamic = "force-dynamic";

export default async function OtaPage() {
  const packages = await prisma.otaPackage.findMany({
    orderBy: { createdAt: "desc" },
    include: { deployments: { include: { device: true } } }
  });

  return (
    <div>
      <PageHeader title="OTA Manager" description="Signed package registry for app, automation engine, browser engine, workflow, and config updates." />
      {packages.length === 0 ? (
        <EmptyState title="No OTA packages" detail="Signed package rows will appear after publishing through the OTA API." />
      ) : (
        <div className="grid gap-4">
          {packages.map((pkg) => (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={pkg.id}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold">{pkg.component} {pkg.version}</h2>
                  <p className="text-sm text-slate-500">{pkg.packageUrl}</p>
                </div>
                <p className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{pkg.status}</p>
              </div>
              <p className="mt-3 text-xs text-slate-500">SHA256 {pkg.sha256}</p>
              <p className="mt-2 text-sm font-semibold text-[rgb(154,75,45)]">{pkg.deployments.length} deployments</p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
