import { prisma } from "./prisma";
import { ApplicationStatus, KioskDeviceStatus, SessionStatus } from "@prisma/client";

/* ── Dashboard ─────────────────────────────────────── */
export async function getDashboardData() {
  const [
    totalDevices, onlineDevices, totalSessions, activeSessions,
    totalApps, submittedApps, completedApps, avgFeedback,
    totalTickets, recentApps, recentSessions,
  ] = await Promise.all([
    prisma.kioskDevice.count({ where: { deletedAt: null } }),
    prisma.kioskDevice.count({ where: { deletedAt: null, status: KioskDeviceStatus.ONLINE } }),
    prisma.kioskSession.count({ where: { deletedAt: null } }),
    prisma.kioskSession.count({ where: { deletedAt: null, status: SessionStatus.ACTIVE } }),
    prisma.application.count({ where: { deletedAt: null } }),
    prisma.application.count({ where: { deletedAt: null, status: ApplicationStatus.SUBMITTED } }),
    prisma.application.count({ where: { deletedAt: null, status: ApplicationStatus.COMPLETED } }),
    prisma.feedback.aggregate({ _avg: { score: true }, where: { deletedAt: null } }),
    prisma.queueTicket.count({ where: { deletedAt: null } }),
    prisma.application.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { citizen: true, procedure: { include: { category: true } } },
    }),
    prisma.kioskSession.findMany({
      where: { deletedAt: null },
      orderBy: { startTime: "desc" },
      take: 6,
      include: { device: { include: { location: true } } },
    }),
  ]);

  return {
    summary: {
      totalDevices, onlineDevices, offlineDevices: totalDevices - onlineDevices,
      totalSessions, activeSessions,
      totalApps, submittedApps, completedApps,
      avgSatisfaction: avgFeedback._avg.score?.toFixed(1) ?? "—",
      totalTickets,
    },
    recentApps,
    recentSessions,
  };
}

/* ── Devices ───────────────────────────────────────── */
export async function getDevices() {
  const devices = await prisma.kioskDevice.findMany({
    where: { deletedAt: null },
    include: {
      location: true,
      components: { where: { deletedAt: null } },
      healthLogs: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { sessions: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return devices.map((device) => ({
    ...device,
    effectiveStatus: getEffectiveDeviceStatus(device),
  }));
}

export async function getDeviceById(id: string) {
  const device = await prisma.kioskDevice.findFirst({
    where: { deletedAt: null, OR: [{ id }, { deviceId: id }, { serialNumber: id }] },
    include: {
      location: true,
      components: { where: { deletedAt: null } },
      healthLogs: { orderBy: { createdAt: "desc" }, take: 20 },
      actions: { orderBy: { performedAt: "desc" }, take: 20 },
      sessions: { orderBy: { startTime: "desc" }, take: 10 },
    },
  });
  return device ? { ...device, effectiveStatus: getEffectiveDeviceStatus(device) } : null;
}

export async function getKioskLocations() {
  return prisma.kioskLocation.findMany({
    where: { deletedAt: null },
    include: { _count: { select: { devices: { where: { deletedAt: null } } } } },
    orderBy: [{ province: "asc" }, { district: "asc" }, { name: "asc" }],
  });
}

function getEffectiveDeviceStatus(device: { isEnabled: boolean; status: string; lastHeartbeat: Date | null }) {
  if (!device.isEnabled || device.status === "MAINTENANCE") return "MAINTENANCE";
  if (!device.lastHeartbeat || Date.now() - device.lastHeartbeat.getTime() > 60_000) return "OFFLINE";
  return device.status;
}

/* ── Applications ──────────────────────────────────── */
export async function getApplications(status?: ApplicationStatus) {
  return prisma.application.findMany({
    where: { deletedAt: null, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      citizen: true,
      procedure: { include: { category: true } },
      statusHistory: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

/* ── Home Services ─────────────────────────────────── */
export async function getHomeServices() {
  return prisma.kioskHomeService.findMany({
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" },
  });
}

/* ── Queue ─────────────────────────────────────────── */
export async function getQueueOverview() {
  const [services, waiting, serving, completed] = await Promise.all([
    prisma.queueService.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: {
        counters: {
          where: { deletedAt: null },
          orderBy: { number: "asc" },
          include: {
            // The ticket currently being called/served at this counter
            tickets: {
              where: { status: { in: ["CALLED", "SERVING"] } },
              orderBy: { calledAt: "desc" },
              take: 1,
            },
          },
        },
        _count: { select: { tickets: { where: { status: "WAITING", deletedAt: null } } } },
      },
    }),
    prisma.queueTicket.count({ where: { status: "WAITING",   deletedAt: null } }),
    prisma.queueTicket.count({ where: { status: "SERVING",   deletedAt: null } }),
    prisma.queueTicket.count({ where: { status: "COMPLETED", deletedAt: null } }),
  ]);
  return { services, stats: { waiting, serving, completed } };
}

export async function getQueueServiceDetail(id: string) {
  const [service, waitingTickets] = await Promise.all([
    prisma.queueService.findUnique({
      where: { id, deletedAt: null },
      include: {
        counters: {
          where: { deletedAt: null },
          orderBy: { number: "asc" },
          include: {
            tickets: {
              where: { status: { in: ["CALLED", "SERVING"] } },
              orderBy: { calledAt: "desc" },
              take: 1,
            },
          },
        },
      },
    }),
    prisma.queueTicket.findMany({
      where: { serviceId: id, status: "WAITING", deletedAt: null },
      orderBy: [{ priority: "desc" }, { issuedAt: "asc" }],
      take: 100,
    }),
  ]);
  return { service, waitingTickets };
}

/* ── Procedures ────────────────────────────────────── */
export async function getProcedures() {
  return prisma.procedure.findMany({
    where: { deletedAt: null },
    include: {
      category: true,
      _count: { select: { applications: true, requirements: true } },
    },
    orderBy: { name: "asc" },
  });
}

/* ── Citizens ──────────────────────────────────────── */
export async function getCitizens() {
  return prisma.citizen.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { _count: { select: { applications: true, documents: true } } },
  });
}

/* ── Admin Users ───────────────────────────────────── */
export async function getAdminUsers() {
  return prisma.adminUser.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: { organization: true, userRoles: { include: { role: true } } },
  });
}

/* ── AI Conversations ──────────────────────────────── */
export async function getAIConversations() {
  return prisma.aIConversation.findMany({
    where: { deletedAt: null },
    orderBy: { startedAt: "desc" },
    take: 30,
    include: {
      _count: { select: { messages: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

/* ── Feedback ──────────────────────────────────────── */
export async function getFeedbacks() {
  const [items, avg] = await Promise.all([
    prisma.feedback.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        session: {
          select: {
            device: {
              select: {
                serialNumber: true,
                location: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.feedback.aggregate({
      _avg: { score: true, starRating: true },
      _count: { id: true },
      where: { deletedAt: null },
    }),
  ]);

  const scoreDistribution = [1, 2, 3, 4, 5].map((score) => ({
    score,
    count: items.filter((item) => item.score === score).length,
  }));
  const satisfiedCount = items.filter((item) => item.score >= 4).length;
  const tagCounts = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const topTags = Array.from(tagCounts, ([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "vi"))
    .slice(0, 8);

  return {
    items,
    avg,
    scoreDistribution,
    topTags,
    satisfactionRate: items.length > 0 ? Math.round((satisfiedCount / items.length) * 100) : 0,
  };
}
