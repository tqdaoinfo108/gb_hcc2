'use strict';
/* Thin HTTP client for the Smart Kiosk API runner endpoints. */

const API_BASE = process.env.API_BASE || 'http://localhost:3001';

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
  dequeue: (runnerUuid, limit = 1) => req('GET', `/selenium/jobs/queue/${runnerUuid}?limit=${limit}`),
  getJob: (id) => req('GET', `/selenium/jobs/${id}`),
  updateStatus: (id, dto) => req('PATCH', `/selenium/jobs/${id}/status`, dto),
  addLog: (id, dto) => req('POST', `/selenium/jobs/${id}/logs`, dto),
  addScreenshot: (id, dto) => req('POST', `/selenium/jobs/${id}/screenshots`, dto),
  requestInput: (id, inputType, payload) => req('POST', `/selenium/jobs/${id}/request-input`, { inputType, payload }),
  pollInput: (id) => req('GET', `/selenium/jobs/${id}/poll-input`),
  // Interactive remote control
  drainInteractions: (id) => req('GET', `/selenium/jobs/${id}/interactions`),
  reportFocus: (id, focused) => req('POST', `/selenium/jobs/${id}/report-focus`, { focused }),
};
