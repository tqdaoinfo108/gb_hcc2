"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.socketEvents = exports.socketNamespaces = void 0;
exports.socketNamespaces = {
    cms: "/cms",
    device: "/device",
    kiosk: "/kiosk"
};
exports.socketEvents = {
    deviceOnline: "device_online",
    deviceOffline: "device_offline",
    heartbeat: "heartbeat",
    command: "command",
    commandResult: "command_result",
    workflowUpdate: "workflow_update",
    otaUpdate: "ota_update",
    error: "error",
    remoteDebug: "remote_debug"
};
//# sourceMappingURL=index.js.map