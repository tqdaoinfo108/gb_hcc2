export const socketNamespaces = {
  cms: "/cms",
  device: "/device",
  kiosk: "/kiosk"
} as const;

export const socketEvents = {
  deviceOnline: "device_online",
  deviceOffline: "device_offline",
  heartbeat: "heartbeat",
  command: "command",
  commandResult: "command_result",
  workflowUpdate: "workflow_update",
  otaUpdate: "ota_update",
  error: "error",
  remoteDebug: "remote_debug"
} as const;

export type RemoteCommand =
  | "restart_app"
  | "restart_device"
  | "lock"
  | "unlock"
  | "clear_cache"
  | "capture_screen"
  | "push_workflow"
  | "update_config";

export type DeviceHeartbeatPayload = {
  deviceId: string;
  version: string;
  location: string;
  ip?: string;
  status: "online" | "offline" | "error" | "maintenance";
  cpuPercent?: number;
  ramPercent?: number;
  diskPercent?: number;
  temperatureC?: number;
  network?: string;
  currentUrl?: string;
  currentStep?: string;
};

export type CommandPayload = {
  id: string;
  deviceId: string;
  command: RemoteCommand;
  payload?: Record<string, unknown>;
  issuedAt: string;
};

export type CommandResultPayload = {
  commandId: string;
  deviceId: string;
  command: RemoteCommand;
  status: "ACK" | "SUCCESS" | "FAILED";
  response?: Record<string, unknown>;
  timestamp: string;
};

export type WorkflowAction = "open" | "click" | "input" | "upload" | "wait" | "assert" | "screenshot";

export type WorkflowStepDefinition = {
  stepKey: string;
  action: WorkflowAction;
  url?: string;
  selectorId?: string;
  inputSource?: string;
  timeoutMs?: number;
  retryCount?: number;
};

export type WorkflowDefinition = {
  name: string;
  version: string;
  steps: WorkflowStepDefinition[];
};

export type SelectorPriority = "data-testid" | "aria-label" | "text" | "css" | "xpath" | "image";

export type SelectorRecord = {
  selectorKey: string;
  selectorType: SelectorPriority;
  selectorValue: string;
  priority: number;
};

export type OtaComponent = "kiosk_app" | "automation_engine" | "workflow" | "browser_engine" | "config";

export type OtaFlowState =
  | "PENDING"
  | "DOWNLOADING"
  | "VERIFYING"
  | "BACKING_UP"
  | "INSTALLING"
  | "HEALTH_CHECK"
  | "SUCCESS"
  | "FAILED"
  | "ROLLED_BACK";

export type RemoteDebugSnapshot = {
  deviceId: string;
  currentUrl?: string;
  currentStep?: string;
  screenshotUrl?: string;
  domTree?: string;
  capturedAt: string;
};
