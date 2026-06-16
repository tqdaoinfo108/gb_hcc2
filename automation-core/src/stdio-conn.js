'use strict';
/*
 * stdio control + signaling channel.
 *
 * Replaces the old localhost WebSocket (signaling-local.js). The automation
 * engine is spawned as a CHILD PROCESS of the Tauri shell; control commands
 * (start-record / start-job / stop) and the WebRTC SDP/ICE handshake flow over
 * the child's stdin/stdout as newline-delimited JSON (NDJSON). The Tauri Rust
 * side relays each line to/from the WebView over Tauri IPC — so there is no
 * listening socket, no port, and nothing on the network. The API is never in
 * this path.
 *
 * Contract:
 *   • stdout  = protocol ONLY. Every line we write is one JSON message.
 *   • stderr  = human logs (console.error). The Rust supervisor inherits it.
 * The engine MUST log with console.error, never console.log, or it would
 * corrupt the protocol stream.
 */

/**
 * @returns {{ send(obj:object):void, onMessage:((msg:object)=>void)|null,
 *             onClose:(()=>void)|null }}
 */
function createStdioConn() {
  const out = process.stdout;

  const conn = {
    /** Write one protocol message to the host (WebView via Rust). */
    send(obj) {
      try { out.write(JSON.stringify(obj) + '\n'); } catch { /* pipe closing */ }
    },
    onMessage: null,
    onClose: null,
  };

  // Read NDJSON from stdin. A single chunk may contain several lines or a
  // partial line, so buffer until each newline.
  let buf = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      let m;
      try { m = JSON.parse(line); } catch { continue; } // ignore non-JSON noise
      conn.onMessage && conn.onMessage(m);
    }
  });
  process.stdin.on('close', () => { conn.onClose && conn.onClose(); });
  process.stdin.on('end', () => { conn.onClose && conn.onClose(); });

  return conn;
}

module.exports = { createStdioConn };
