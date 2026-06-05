import { prisma } from "./prisma";

export async function getDashboardData() {
  const [devices, statuses, sessions, workflows, deployments] = await Promise.all([
    prisma.device.findMany({ orderBy: { updatedAt: "desc" } }),
    prisma.deviceStatus.findMany({
      distinct: ["deviceId"],
      orderBy: [{ deviceId: "asc" }, { lastHeartbeat: "desc" }]
    }),
    prisma.automationSession.findMany({ orderBy: { startedAt: "desc" }, take: 8 }),
    prisma.workflow.findMany({ orderBy: { updatedAt: "desc" }, take: 8 }),
    prisma.otaDeployment.findMany({
      orderBy: { startedAt: "desc" },
      take: 8,
      include: { device: true, otaPackage: true }
    })
  ]);

  const online = statuses.filter((status) => status.online).length;
  return {
    summary: {
      total: devices.length,
      online,
      offline: Math.max(devices.length - online, 0),
      error: sessions.filter((session) => session.status === "FAILED").length
    },
    devices,
    statuses,
    sessions,
    workflows,
    deployments
  };
}
