'use strict';
/* Thin HTTP client for the API endpoints the executor needs.
   Job STATE only — no frames, no interaction polling, no input requests
   (those flow over the WebRTC DataChannel). The recorder role does not use
   this at all (the WebView saves steps via PUT /templates/:id/steps). */

const API_BASE = process.env.API_BASE || process.env.TAURI_API_URL || 'http://localhost:3001';

async function req(method, path, body) {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  return data;
}

module.exports = {
  API_BASE,
  registerRunner: (dto) => req('POST', '/selenium/runners/register', dto),
  heartbeat: (runnerId, dto) => req('POST', `/selenium/runners/${runnerId}/heartbeat`, dto),
  getJob: (id) => req('GET', `/selenium/jobs/${id}`),
  updateStatus: (id, dto) => req('PATCH', `/selenium/jobs/${id}/status`, dto),
  addLog: (id, dto) => req('POST', `/selenium/jobs/${id}/logs`, dto),
};
