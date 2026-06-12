const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
  getVisible: (locationId?: string) =>
    apiRequest<HomeServiceData[]>(
      `/kiosk/home-services${locationId ? `?locationId=${encodeURIComponent(locationId)}` : ""}`,
    ),
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
  getServices: (locationId?: string) =>
    apiRequest<QueueServiceData[]>(`/queue/services${locationId ? `?locationId=${encodeURIComponent(locationId)}` : ""}`),
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
  /** Interactive remote control — forward touch/key/scroll/finish to the live browser */
  interact: (jobId: string, body: {
    type: 'click' | 'touchStart' | 'touchMove' | 'touchEnd' | 'type' | 'key' | 'scroll' | 'finish';
    x?: number;
    y?: number;
    text?: string;
    key?: string;
    deltaX?: number;
    deltaY?: number;
  }) =>
    apiRequest<{ queued: number }>(`/selenium/jobs/${jobId}/interact`, {
      method: 'POST', body: JSON.stringify(body),
    }),
  /** Create an upload session (returns QR + mobile URL) when the portal asks for a file */
  createUploadSession: (jobId: string, baseUrl?: string) =>
    apiRequest<{ token: string; mobileUrl: string; qrUrl: string }>(`/selenium/upload/session/${jobId}`, {
      method: 'POST', body: JSON.stringify({ baseUrl: baseUrl ?? apiUrl }),
    }),
  /** Upload a file captured on the kiosk itself */
  uploadKioskFile: async (token: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${apiUrl}/selenium/upload/${token}`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json() as Promise<{ ok: boolean; fileUrl: string }>;
  },
};

// ─── Procedures API ──────────────────────────────────────

export interface ProcedureData {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  fee?: number | null;
  slaWorkDays?: number | null;
  category?: { id: string; name: string } | null;
}

export interface ProcedureInCategory {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  slaWorkDays: number;
  fee: number;
  feeNote: string | null;
  agency: string | null;
  online: boolean;
}
export interface CategoryGroup {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  icon: string | null;
  colorHex: string | null;
  procedures: ProcedureInCategory[];
}

export const proceduresApi = {
  findAll: (params?: { search?: string; categoryId?: string }) => {
    const qs = new URLSearchParams();
    if (params?.search) qs.set('search', params.search);
    if (params?.categoryId) qs.set('categoryId', params.categoryId);
    const query = qs.toString() ? `?${qs}` : '';
    return apiRequest<ProcedureData[]>(`/procedures${query}`);
  },
  grouped: () => apiRequest<CategoryGroup[]>(`/procedures/grouped`),
};

// ─── Workflow Launch API ──────────────────────────────────

export interface WorkflowLaunchResult {
  jobId: string;
  status: string;
  runnerAssigned: boolean;
  workflow: { id: string; name: string; stepCount: number };
  message: string;
}

export const workflowApi = {
  launch: (body: {
    procedureId: string;
    kioskSessionId: string;
    citizenId?: string;
    deviceSerial?: string;
    source?: 'MANUAL' | 'AI' | 'VOICE';
    formData?: Record<string, unknown>;
  }) => apiRequest<WorkflowLaunchResult>('/workflows/launch', {
    method: 'POST',
    body: JSON.stringify(body),
  }),
  resolve: (procedureId: string) => apiRequest<{
    procedure: { id: string; name: string; slaWorkDays?: number; fee?: number };
    online: boolean;
    workflow: { id: string; name: string; stepCount: number } | null;
  }>(`/workflows/resolve/${procedureId}`),
};

// ─── Copy-Doc API ────────────────────────────────────────

export interface CopyDocCategoryData {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  icon: string | null;
  colorHex: string | null;
  pricePerCopy: number;
  processingFeeRate: number;
  maxCopiesPerRequest: number;
  isActive: boolean;
  ocrKeywords: string[];
  ocrDocTypes: string[];
}

export interface CopyDocRequestData {
  id: string;
  requestCode: string;
  status: string;
  quantity: number;
  baseFee: number;
  processingFee: number;
  totalFee: number;
  receiptCode: string | null;
  categoryId: string | null;
  detectedCategoryId: string | null;
  detectedTypeLabel: string | null;
  detectedTypeConfidence: number | null;
  rawImagePath: string | null;
  processedImagePath: string | null;
  pdfPath: string | null;
  category: CopyDocCategoryData | null;
}

export interface AiProcessingResult {
  status: string;
  corners: { x: number; y: number }[];
  ocrText: string;
  matchResult: {
    categoryId: string;
    categoryName: string;
    confidence: number;
    matchedKeywords: string[];
    pricePerCopy: number;
  } | null;
  detectedCategoryId?: string;
  detectedTypeLabel?: string;
  detectedTypeConfidence?: number;
  category?: CopyDocCategoryData | null;
}

const apiUrlRaw = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface ScanSessionData {
  id: string;
  sessionToken: string;
  qrPayload: string;
  requestId: string;
  status: string;
  expiresAt: string;
}

export const copyDocApi = {
  getCategories: (locationId?: string) =>
    apiRequest<CopyDocCategoryData[]>(`/copy-doc/categories${locationId ? `?locationId=${encodeURIComponent(locationId)}` : ""}`),

  initiateRequest: (sessionId: string, kioskDeviceId?: string) =>
    apiRequest<CopyDocRequestData>("/copy-doc/requests", {
      method: "POST",
      body: JSON.stringify({ sessionId, kioskDeviceId }),
    }),

  /** Create a mobile scan session — returns QR payload + sessionToken */
  createScanSession: (requestId: string) =>
    apiRequest<ScanSessionData>(`/copy-doc/scan/${requestId}/session`, {
      method: "POST",
      body: JSON.stringify({ baseUrl: apiUrlRaw }),
    }),

  uploadImage: async (requestId: string, file: File): Promise<{ storagePath: string; url: string; requestId: string }> => {
    const form = new FormData();
    form.append("file", file);
    form.append("requestId", requestId);
    const res = await fetch(`${apiUrlRaw}/copy-doc/requests/upload`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
  },

  triggerAi: (requestId: string) =>
    apiRequest<AiProcessingResult>(`/copy-doc/requests/${requestId}/trigger-ai`, { method: "POST" }),

  applyAiResult: (requestId: string, body: { categoryId: string; detectedTypeLabel: string; detectedTypeConfidence: number; corners?: { x: number; y: number }[] }) =>
    apiRequest<CopyDocRequestData>(`/copy-doc/requests/${requestId}/apply-ai-result`, {
      method: "POST", body: JSON.stringify(body),
    }),

  generatePdf: (requestId: string) =>
    apiRequest<{ pdfPath: string; pdfUrl: string; requestId: string }>(`/copy-doc/requests/${requestId}/generate-pdf`, {
      method: "POST",
    }),

  /** Send confirmed corners to backend — backend crops raw image with Sharp and saves processedImagePath */
  saveProcessedImage: (requestId: string, corners: { x: number; y: number }[]) =>
    apiRequest<{ storagePath: string; url: string }>(
      `/copy-doc/requests/${requestId}/processed-image`,
      { method: "POST", body: JSON.stringify({ corners }) },
    ),

  /** Crop a specific page by index — backend crops that page's raw image */
  cropPage: (requestId: string, pageIndex: number, corners: { x: number; y: number }[]) =>
    apiRequest<{ storagePath: string; url: string }>(
      `/copy-doc/requests/${requestId}/pages/${pageIndex}/crop`,
      { method: "POST", body: JSON.stringify({ corners }) },
    ),
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
