'use strict';
/*
 * @smart-kiosk/automation-core — Tauri-first Playwright + WebRTC engine.
 *
 * Consumed by a single entrypoint (bin/engine.js) that the Tauri shell spawns
 * as a child process over stdio. The same engine serves both roles — recorder
 * (CMS-authored steps) and executor (kiosk job runs) — selected per command.
 *
 * OVERLAY model: the real chromeless Chromium window is positioned over the
 * kiosk UI's frame (no WebRTC, no screencast, no @roamhq/wrtc). Control + frame
 * bounds flow over stdio/IPC.
 */

module.exports = {
  ...require('./protocol'),
  ...require('./browser'),
  ...require('./steps'),
  ...require('./recorder'),
  ...require('./recorder-inject'),
  ...require('./input'),
  ...require('./stdio-conn'),
};
