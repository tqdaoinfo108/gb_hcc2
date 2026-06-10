const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type KioskDeviceState = {
  deviceId: string;
  location: string;
  version: string;
  isLocked: boolean;
  latestStatus: {
    online: boolean;
    cpuPercent?: number | null;
    ramPercent?: number | null;
    diskPercent?: number | null;
    temperatureC?: number | null;
    currentUrl?: string | null;
    currentStep?: string | null;
  } | null;
};

/* ── Home Services API types ───────────────────────────── */
export interface HomeServiceData {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  icon: string | null;
  colorHex: string | null;
  bgColorHex: string | null;
  screenId: string;
  badge: string | null;
  sortOrder: number;
  isVisible: boolean;
}

/* ── Queue API types ───────────────────────────────────── */
export interface QueueServiceData {
  id: string;
  code: string;
  name: string;
  prefix: string;
  colorHex: string | null;
  currentNumber: number;
  description: string | null;
  isActive: boolean;
  counters: Array<{ id: string; number: string; name: string | null; status: string }>;
  _count: { tickets: number };
}

export interface QueueTicketData {
  id: string;
  displayNumber: string;
  ticketNumber: number;
  serviceId: string;
  status: string;
  issuedAt: string;
  service?: { name: string; prefix: string; colorHex: string | null };
  waitingAhead?: number;
  estimatedWaitMin?: number;
}

export interface ServiceStats {
  serviceId: string;
  serviceName: string;
  prefix: string;
  waitingCount: number;
  currentServing: string | null;
  estimatedWaitMin: number;
}

export interface KioskSessionData {
  id: string;
  deviceId: string;
  language: string;
  status: string;
  currentScreen: string | null;
}

export interface KioskRuntimeConfig {
  id: string;
  deviceId: string;
  serialNumber: string;
  locationId: string;
  name: string | null;
  placement: string | null;
  isEnabled: boolean;
  status: "ONLINE" | "OFFLINE" | "MAINTENANCE" | "ERROR";
  maintenanceMessage: string | null;
  tickerText: string | null;
  model: string | null;
  firmwareVersion: string | null;
  lastHeartbeat: string | null;
  location: {
    id: string;
    code: string;
    name: string;
    address: string;
    district: string | null;
    province: string | null;
  };
}

export interface DeviceHeartbeatInput {
  serialNumber?: string;
  name?: string;
  model?: string;
  firmwareVersion?: string;
  macAddress?: string;
  cpuUsage?: number;
  memoryUsage?: number;
  diskUsage?: number;
  temperatureC?: number;
  networkLatency?: number;
  hostname?: string;
  os?: string;
  browser?: string;
  appVersion?: string;
  screenResolution?: string;
  userAgent?: string;
  currentScreen?: string;
  sessionId?: string;
  components?: Record<string, unknown>;
}

export interface FeedbackData {
  id: string;
  sessionId: string;
  targetType: "SERVICE" | "OFFICER" | "KIOSK" | "APPLICATION" | "QUEUE" | "OVERALL";
  targetId: string | null;
  score: number;
  starRating: number | null;
  comment: string | null;
  tags: string[];
  language: string;
  createdAt: string;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const homeServicesApi = {
  getVisible: () => apiRequest<HomeServiceData[]>("/kiosk/home-services"),
};

export const sessionsApi = {
  create: (body: { deviceId: string; language?: string; citizenId?: string }) =>
    apiRequest<KioskSessionData>("/sessions", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateScreen: (sessionId: string, screen: string) =>
    apiRequest<KioskSessionData>(`/sessions/${sessionId}/screen`, {
      method: "PATCH",
      body: JSON.stringify({ screen }),
    }),
  complete: (sessionId: string) =>
    apiRequest<KioskSessionData>(`/sessions/${sessionId}/complete`, { method: "PATCH" }),
};

export const deviceApi = {
  getConfig: (deviceId: string) =>
    apiRequest<KioskRuntimeConfig>(`/kiosk-devices/config/${encodeURIComponent(deviceId)}`),
  heartbeat: (deviceId: string, body: DeviceHeartbeatInput) =>
    apiRequest<KioskRuntimeConfig>(`/kiosk-devices/${encodeURIComponent(deviceId)}/heartbeat`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export const feedbackApi = {
  submit: (body: {
    sessionId: string;
    targetType: FeedbackData["targetType"];
    targetId?: string;
    score: number;
    starRating?: number;
    comment?: string;
    tags?: string[];
    language?: string;
  }) =>
    apiRequest<FeedbackData>("/feedback", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export const queueApi = {
  seed:        () => apiRequest<{ seeded: boolean; message: string; count: number }>("/queue/seed", { method: "POST" }),
  getServices: () => apiRequest<QueueServiceData[]>("/queue/services"),
  getStats:    (id: string) => apiRequest<ServiceStats>(`/queue/services/${id}/stats`),
  issueTicket: (serviceId: string, body?: { kioskId?: string; sessionId?: string }) =>
    apiRequest<QueueTicketData>(`/queue/${serviceId}/issue`, { method: "POST", body: JSON.stringify(body ?? {}) }),
  callNext:    (serviceId: string, counterId: string) =>
    apiRequest<QueueTicketData | null>(`/queue/${serviceId}/call-next`, { method: "POST", body: JSON.stringify({ counterId }) }),
  complete:    (id: string) => apiRequest<QueueTicketData>(`/queue/tickets/${id}/complete`, { method: "PATCH" }),
  cancel:      (id: string) => apiRequest<QueueTicketData>(`/queue/tickets/${id}/cancel`,   { method: "PATCH" }),
};

// ─── Selenium / Automation Job API ───────────────────────

export interface WorkflowTemplateData {
  id: string;
  code: string;
  name: string;
  description: string | null;
  targetUrl: string;
  authMethod: string;
  timeoutSeconds: number;
  isActive: boolean;
  isPublished: boolean;
  steps: Array<{
    id: string;
    stepOrder: number;
    stepType: string;
    name: string;
    description: string | null;
    isRequired: boolean;
  }>;
}

export interface SeleniumJobData {
  id: string;
  templateId: string;
  status: string;
  progressPercent: number;
  currentStepOrder: number;
  inputData: Record<string, unknown> | null;
  outputData: Record<string, unknown> | null;
  failReason: string | null;
  startedAt: string | null;
  completedAt: string | null;
  template: { id: string; code: string; name: string };
  runner: { id: string; runnerId: string; name: string } | null;
}

export const seleniumApi = {
  getTemplates: () => apiRequest<WorkflowTemplateData[]>('/selenium/templates'),
  getTemplate:  (id: string) => apiRequest<WorkflowTemplateData>(`/selenium/templates/${id}`),
  dispatch: (body: {
    templateId: string;
    kioskSessionId?: string;
    citizenId?: string;
    deviceSerial?: string;
    priority?: number;
    inputData?: Record<string, unknown>;
  }) => apiRequest<SeleniumJobData>('/selenium/jobs/dispatch', {
    method: 'POST', body: JSON.stringify(body),
  }),
  getJob: (jobId: string) => apiRequest<SeleniumJobData>(`/selenium/jobs/${jobId}`),
  cancel:  (jobId: string) => apiRequest<SeleniumJobData>(`/selenium/jobs/${jobId}/cancel`, { method: 'POST' }),
  submitCitizenInput: (jobId: string, body: { inputType: string; value?: string; payload?: Record<string, unknown> }) =>
    apiRequest<{ jobId: string; received: boolean }>(`/selenium/jobs/${jobId}/citizen-input`, {
      method: 'POST', body: JSON.stringify(body),
    }),
};

/* ── Device API (legacy) ────────────────────────────────── */
export async function getDeviceState(deviceId: string): Promise<KioskDeviceState | null> {
  const response = await fetch(`${apiUrl}/devices/${encodeURIComponent(deviceId)}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    return null;
  }

  const text = await response.text();
  if (!text.trim()) {
    return null;
  }

  const device = JSON.parse(text);
  if (!device) {
    return null;
  }

  return {
    deviceId: device.deviceId,
    location: device.location,
    version: device.version,
    isLocked: device.isLocked,
    latestStatus: device.statuses?.[0] ?? null
  };
}
