use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use sysinfo::{Components, Disks, System};
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

/// When true, kiosk lock is lifted so the admin can move/resize the window for dev work.
static DEV_MODE: AtomicBool = AtomicBool::new(false);
/// When true, a real chromeless Chromium window is overlaying the kiosk frame.
/// The Tauri window must NOT be always-on-top while this is set, or it would
/// cover the overlay browser. Also suppresses the focus-loss re-lock.
static OVERLAY_ACTIVE: AtomicBool = AtomicBool::new(false);

#[derive(Serialize)]
struct DeviceMetrics {
  #[serde(rename = "cpuPercent")]
  cpu_percent: f32,
  #[serde(rename = "ramPercent")]
  ram_percent: f32,
  #[serde(rename = "diskPercent")]
  disk_percent: f32,
  #[serde(rename = "temperatureC")]
  temperature_c: Option<f32>,
  hostname: Option<String>,
  os: Option<String>,
  network: String,
}

#[derive(Deserialize, Serialize)]
struct DeviceIdentity {
  serial: String,
}

fn read_device_identity(path: &Path) -> Option<String> {
  let content = fs::read_to_string(path).ok()?;
  let identity = serde_json::from_str::<DeviceIdentity>(&content).ok()?;
  let serial = identity.serial.trim();
  (!serial.is_empty()).then(|| serial.to_string())
}

fn device_identity_paths(app: &tauri::AppHandle) -> Vec<PathBuf> {
  let mut paths = Vec::new();

  if let Ok(program_data) = std::env::var("PROGRAMDATA") {
    paths.push(PathBuf::from(program_data).join("SmartGovernmentKiosk").join("device.json"));
  }
  if let Ok(executable) = std::env::current_exe() {
    if let Some(directory) = executable.parent() {
      paths.push(directory.join("device.json"));
    }
  }
  if let Ok(directory) = std::env::current_dir() {
    paths.push(directory.join("device.json"));
  }
  if let Ok(directory) = app.path().app_data_dir() {
    paths.push(directory.join("device.json"));
  }

  paths
}

#[tauri::command]
fn get_device_serial(app: tauri::AppHandle) -> Result<String, String> {
  let paths = device_identity_paths(&app);
  for path in &paths {
    if let Some(serial) = read_device_identity(path) {
      return Ok(serial);
    }
  }

  let generated = format!(
    "KIOSK-{}",
    uuid::Uuid::new_v4()
      .simple()
      .to_string()
      .chars()
      .take(12)
      .collect::<String>()
      .to_uppercase()
  );
  let destination = paths
    .last()
    .ok_or_else(|| "Cannot determine the kiosk identity storage path".to_string())?;
  if let Some(directory) = destination.parent() {
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
  }
  let content = serde_json::to_string_pretty(&DeviceIdentity {
    serial: generated.clone(),
  })
  .map_err(|error| error.to_string())?;
  fs::write(destination, content).map_err(|error| error.to_string())?;

  Ok(generated)
}

#[tauri::command]
fn collect_device_metrics() -> DeviceMetrics {
  let mut system = System::new_all();
  system.refresh_all();

  let cpu_percent = system.global_cpu_info().cpu_usage();
  let total_memory = system.total_memory() as f32;
  let used_memory = system.used_memory() as f32;
  let ram_percent = if total_memory > 0.0 {
    (used_memory / total_memory) * 100.0
  } else {
    0.0
  };

  let disks = Disks::new_with_refreshed_list();
  let mut total_disk = 0.0_f32;
  let mut used_disk = 0.0_f32;
  for disk in disks.list() {
    let total = disk.total_space() as f32;
    let available = disk.available_space() as f32;
    total_disk += total;
    used_disk += total - available;
  }
  let disk_percent = if total_disk > 0.0 {
    (used_disk / total_disk) * 100.0
  } else {
    0.0
  };

  let components = Components::new_with_refreshed_list();
  let temperatures: Vec<f32> = components.iter().map(|component| component.temperature()).collect();
  let temperature_c = if temperatures.is_empty() {
    None
  } else {
    Some(temperatures.iter().sum::<f32>() / temperatures.len() as f32)
  };

  DeviceMetrics {
    cpu_percent,
    ram_percent,
    disk_percent,
    temperature_c,
    hostname: System::host_name(),
    os: System::long_os_version(),
    network: "native".to_string(),
  }
}

#[tauri::command]
fn lock_kiosk() -> serde_json::Value {
  serde_json::json!({ "locked": true })
}

#[tauri::command]
fn unlock_kiosk() -> serde_json::Value {
  serde_json::json!({ "locked": true, "managedByWindows": true })
}

#[tauri::command]
fn clear_session_data() -> serde_json::Value {
  serde_json::json!({
    "cookies": "clear_requested",
    "cache": "clear_requested",
    "localStorage": "clear_requested"
  })
}

#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
  app.restart();
}

/// Reboot the host machine (remote command from the CMS console).
#[tauri::command]
fn reboot_device() -> Result<(), String> {
  run_power_command("/r")
}

/// Power off the host machine (remote command from the CMS console).
#[tauri::command]
fn shutdown_device() -> Result<(), String> {
  run_power_command("/s")
}

#[cfg(windows)]
fn run_power_command(flag: &str) -> Result<(), String> {
  std::process::Command::new("shutdown")
    .args([flag, "/t", "0", "/f"])
    .spawn()
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[cfg(not(windows))]
fn run_power_command(_flag: &str) -> Result<(), String> {
  Err("power command is only supported on Windows kiosks".to_string())
}

#[tauri::command]
fn health_check() -> serde_json::Value {
  serde_json::json!({ "status": "ok" })
}

trait KioskWindowControls {
  fn kiosk_decorations(&self, decorations: bool);
  fn kiosk_always_on_top(&self, always_on_top: bool);
  fn kiosk_fullscreen(&self, fullscreen: bool);
  fn kiosk_skip_taskbar(&self, skip: bool);
  fn kiosk_resizable(&self, resizable: bool);
  fn kiosk_focus(&self);
}

impl<R: tauri::Runtime> KioskWindowControls for tauri::Window<R> {
  fn kiosk_decorations(&self, decorations: bool) { let _ = self.set_decorations(decorations); }
  fn kiosk_always_on_top(&self, always_on_top: bool) { let _ = self.set_always_on_top(always_on_top); }
  fn kiosk_fullscreen(&self, fullscreen: bool) { let _ = self.set_fullscreen(fullscreen); }
  fn kiosk_skip_taskbar(&self, skip: bool) { let _ = self.set_skip_taskbar(skip); }
  fn kiosk_resizable(&self, resizable: bool) { let _ = self.set_resizable(resizable); }
  fn kiosk_focus(&self) { let _ = self.set_focus(); }
}

impl<R: tauri::Runtime> KioskWindowControls for tauri::WebviewWindow<R> {
  fn kiosk_decorations(&self, decorations: bool) { let _ = self.set_decorations(decorations); }
  fn kiosk_always_on_top(&self, always_on_top: bool) { let _ = self.set_always_on_top(always_on_top); }
  fn kiosk_fullscreen(&self, fullscreen: bool) { let _ = self.set_fullscreen(fullscreen); }
  fn kiosk_skip_taskbar(&self, skip: bool) { let _ = self.set_skip_taskbar(skip); }
  fn kiosk_resizable(&self, resizable: bool) { let _ = self.set_resizable(resizable); }
  fn kiosk_focus(&self) { let _ = self.set_focus(); }
}

fn enforce_kiosk_window(window: &impl KioskWindowControls) {
  if DEV_MODE.load(Ordering::Relaxed) || OVERLAY_ACTIVE.load(Ordering::Relaxed) { return; }
  window.kiosk_decorations(false);
  window.kiosk_resizable(false);
  window.kiosk_always_on_top(true);
  window.kiosk_skip_taskbar(true);
  window.kiosk_fullscreen(true);
  window.kiosk_focus();
}

/// Force the overlay Chromium window(s) to be top-most so they float ABOVE the
/// (fullscreen) Tauri window — which otherwise covers them whenever it regains
/// focus, leaving the live-view frame blank/white. The real browser only covers
/// the frame rect, so the kiosk UI around it stays visible and clickable.
/// No-op off Windows / when overlay isn't active.
#[cfg(windows)]
unsafe extern "system" fn raise_overlay_cb(
  hwnd: windows_sys::Win32::Foundation::HWND,
  exclude: windows_sys::Win32::Foundation::LPARAM,
) -> i32 {
  use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetClassNameW, IsWindowVisible, SetWindowPos, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE,
  };
  if (hwnd as isize) == (exclude as isize) { return 1; }
  if IsWindowVisible(hwnd) == 0 { return 1; }
  let mut buf = [0u16; 64];
  let n = GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
  if n > 0 {
    let class = String::from_utf16_lossy(&buf[..n as usize]);
    // Top-level Playwright Chromium windows are class "Chrome_WidgetWin_1".
    // (Tauri's own WebView2 is a CHILD window, so EnumWindows won't list it.)
    if class == "Chrome_WidgetWin_1" {
      SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }
  }
  1
}

#[tauri::command]
fn raise_overlay_browser(app: tauri::AppHandle) {
  if !OVERLAY_ACTIVE.load(Ordering::Relaxed) { return; }
  #[cfg(windows)]
  {
    use windows_sys::Win32::UI::WindowsAndMessaging::EnumWindows;
    let exclude = app
      .get_webview_window("main")
      .and_then(|w| w.hwnd().ok())
      .map(|h| h.0 as isize)
      .unwrap_or(0);
    unsafe { EnumWindows(Some(raise_overlay_cb), exclude as windows_sys::Win32::Foundation::LPARAM); }
  }
  #[cfg(not(windows))]
  { let _ = app; }
}

/// Ctrl+Alt+F2 from the WebView: toggle between fullscreen kiosk and a normal
/// resizable windowed mode for development/recording without a rebuild.
/// Returns the new dev-mode state (true = windowed).
#[tauri::command]
fn toggle_dev_window(app: tauri::AppHandle) -> bool {
  let now_dev = !DEV_MODE.load(Ordering::SeqCst);
  DEV_MODE.store(now_dev, Ordering::SeqCst);
  if let Some(window) = app.get_webview_window("main") {
    if now_dev {
      let _ = window.set_fullscreen(false);
      let _ = window.set_decorations(true);
      let _ = window.set_always_on_top(false);
      let _ = window.set_skip_taskbar(false);
      let _ = window.set_resizable(true);
      let _ = window.set_size(tauri::LogicalSize::new(1400_f64, 900_f64));
    } else {
      DEV_MODE.store(false, Ordering::SeqCst); // already stored, but make intent clear
      enforce_kiosk_window(&window);
    }
  }
  now_dev
}

#[cfg(windows)]
mod windows_kiosk {
  use std::ptr;
  use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
  use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_CONTROL, VK_ESCAPE, VK_F1, VK_F4, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT,
    VK_TAB,
  };
  use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, GetMessageW, SetWindowsHookExW, KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL,
    WM_KEYDOWN, WM_SYSKEYDOWN,
  };

  fn key_down(key: u16) -> bool {
    unsafe { (GetAsyncKeyState(key as i32) as u16 & 0x8000) != 0 }
  }

  unsafe extern "system" fn keyboard_hook(
    code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
  ) -> LRESULT {
    if code >= 0 && (w_param == WM_KEYDOWN as usize || w_param == WM_SYSKEYDOWN as usize) {
      let key = (*(l_param as *const KBDLLHOOKSTRUCT)).vkCode as u16;
      let alt = key_down(VK_MENU);
      let ctrl = key_down(VK_CONTROL);
      let shift = key_down(VK_SHIFT);

      // Hidden service exit: Ctrl + Alt + F1
      if ctrl && alt && key == VK_F1 {
        std::process::exit(0);
      }

      let dev = super::DEV_MODE.load(super::Ordering::Relaxed);
      let blocked = key == VK_LWIN
        || key == VK_RWIN
        || (!dev && key == VK_TAB && alt) // allow Alt+Tab in dev/windowed mode
        || (key == VK_ESCAPE && (alt || ctrl))
        || (key == VK_F4 && alt)
        || (key == VK_ESCAPE && ctrl && shift);

      if blocked {
        return 1;
      }
    }

    CallNextHookEx(ptr::null_mut(), code, w_param, l_param)
  }

  pub fn install_keyboard_lock() {
    std::thread::spawn(|| unsafe {
      let hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_hook), ptr::null_mut(), 0);
      if hook.is_null() {
        eprintln!("Unable to install the Windows kiosk keyboard hook");
        return;
      }

      let mut message: MSG = std::mem::zeroed();
      while GetMessageW(&mut message, ptr::null_mut(), 0, 0) > 0 {}
    });
  }
}

/* ───────────────── Native offline voice (Vosk, Vietnamese) ─────────────────
 * Feature-gated (`--features voice`). The Web Speech API does not work inside
 * WebView2, so speech-to-text runs natively: cpal captures the mic, Vosk decodes
 * with a bundled Vietnamese model, and partial/final transcripts are emitted to
 * the webview as `voice:partial` / `voice:final` events. Only one session runs at
 * a time (a second voice_start while listening is ignored) so fast taps never
 * stack overlapping recognizers. */
#[cfg(feature = "voice")]
mod voice {
  use std::sync::atomic::{AtomicBool, Ordering};
  use std::sync::{mpsc, Mutex};
  use std::time::Duration;
  use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
  use tauri::{AppHandle, Emitter, Manager};
  use vosk::{CompleteResult, DecodingState, Model, Recognizer};

  static RUNNING: AtomicBool = AtomicBool::new(false);
  static STOP_TX: Mutex<Option<mpsc::Sender<()>>> = Mutex::new(None);

  fn model_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    if let Ok(p) = std::env::var("VOSK_MODEL_PATH") {
      let pb = std::path::PathBuf::from(p);
      if pb.exists() { return Some(pb); }
    }
    if let Ok(p) = app.path().resolve("resources/vosk-model-vi", tauri::path::BaseDirectory::Resource) {
      if p.exists() { return Some(p); }
    }
    None
  }

  pub fn start(app: AppHandle) -> Result<(), String> {
    // Already listening → ignore so rapid taps don't stack sessions.
    if RUNNING.swap(true, Ordering::SeqCst) { return Ok(()); }

    let model_dir = match model_path(&app) {
      Some(p) => p,
      None => { RUNNING.store(false, Ordering::SeqCst); return Err("Không tìm thấy mô hình giọng nói (vosk-model-vi).".into()); }
    };

    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    *STOP_TX.lock().unwrap() = Some(stop_tx);

    std::thread::spawn(move || {
      if let Err(e) = run_loop(&app, &model_dir, stop_rx) {
        let _ = app.emit("voice:error", e);
      }
      RUNNING.store(false, Ordering::SeqCst);
      let _ = app.emit("voice:ended", ());
    });
    Ok(())
  }

  pub fn stop() -> Result<(), String> {
    if let Some(tx) = STOP_TX.lock().unwrap().take() { let _ = tx.send(()); }
    Ok(())
  }

  fn run_loop(app: &AppHandle, model_dir: &std::path::Path, stop_rx: mpsc::Receiver<()>) -> Result<(), String> {
    let host = cpal::default_host();
    let device = host.default_input_device().ok_or("Không có thiết bị thu âm.")?;
    let cfg = device.default_input_config().map_err(|e| e.to_string())?;
    let sample_rate = cfg.sample_rate().0 as f32;
    let channels = cfg.channels() as usize;

    let model = Model::new(model_dir.to_string_lossy().as_ref()).ok_or("Không nạp được mô hình Vosk.")?;
    let mut rec = Recognizer::new(&model, sample_rate).ok_or("Không khởi tạo được bộ nhận dạng.")?;

    let (tx, rx) = mpsc::channel::<Vec<i16>>();
    let err_fn = |e| eprintln!("voice stream error: {e}");
    let stream_cfg = cfg.config();

    // Downmix to mono i16 in the audio callback; decode in this loop.
    let stream = match cfg.sample_format() {
      cpal::SampleFormat::F32 => device.build_input_stream(&stream_cfg,
        move |data: &[f32], _: &cpal::InputCallbackInfo| {
          let _ = tx.send(data.chunks(channels).map(|f| (f[0] * 32767.0) as i16).collect());
        }, err_fn, None),
      cpal::SampleFormat::I16 => device.build_input_stream(&stream_cfg,
        move |data: &[i16], _: &cpal::InputCallbackInfo| {
          let _ = tx.send(data.chunks(channels).map(|f| f[0]).collect());
        }, err_fn, None),
      cpal::SampleFormat::U16 => device.build_input_stream(&stream_cfg,
        move |data: &[u16], _: &cpal::InputCallbackInfo| {
          let _ = tx.send(data.chunks(channels).map(|f| (f[0] as i32 - 32768) as i16).collect());
        }, err_fn, None),
      _ => return Err("Định dạng âm thanh không hỗ trợ.".into()),
    }.map_err(|e| e.to_string())?;

    stream.play().map_err(|e| e.to_string())?;

    let mut last_partial = String::new();
    loop {
      if stop_rx.try_recv().is_ok() { break; }
      match rx.recv_timeout(Duration::from_millis(100)) {
        Ok(samples) => match rec.accept_waveform(&samples) {
          Ok(DecodingState::Finalized) => {
            if let CompleteResult::Single(r) = rec.result() {
              let text = r.text.trim().to_string();
              if !text.is_empty() { let _ = app.emit("voice:final", text); break; }
            }
          }
          Ok(DecodingState::Running) => {
            let p = rec.partial_result().partial.trim().to_string();
            if !p.is_empty() && p != last_partial {
              last_partial = p.clone();
              let _ = app.emit("voice:partial", p);
            }
          }
          Ok(DecodingState::Failed) => {}
          Err(_) => {}
        },
        Err(mpsc::RecvTimeoutError::Timeout) => {}
        Err(mpsc::RecvTimeoutError::Disconnected) => break,
      }
    }
    drop(stream);
    Ok(())
  }
}

/// Start native voice capture (emits `voice:partial` / `voice:final`).
#[tauri::command]
fn voice_start(app: tauri::AppHandle) -> Result<(), String> {
  #[cfg(feature = "voice")]
  { voice::start(app) }
  #[cfg(not(feature = "voice"))]
  { let _ = app; Err("Tính năng giọng nói chưa được bật trong bản build này (build với --features voice).".into()) }
}

/// Stop the current voice capture session.
#[tauri::command]
fn voice_stop() -> Result<(), String> {
  #[cfg(feature = "voice")]
  { voice::stop() }
  #[cfg(not(feature = "voice"))]
  { Ok(()) }
}

/* ─────────────────── Automation engine (Tauri-first) ───────────────────
 * The Playwright + WebRTC automation engine (automation-core/bin/engine.js)
 * runs as ONE Node child process that this Rust shell spawns and SUPERVISES
 * (auto-restart with backoff — a crash mid-session must never brick the kiosk).
 * It serves both roles (recorder authoring / executor runtime) selected per
 * command. There is NO localhost WebSocket and NO port: control + WebRTC SDP/ICE
 * are newline-delimited JSON over the child's stdin/stdout, and this shell
 * relays each line to/from the WebView over Tauri IPC —
 *   • engine stdout (JSON line) → emit `engine://message` to the WebView
 *   • WebView `engine_send`      → write a JSON line to the engine's stdin
 *   • spawn/exit                 → emit `engine://status` { ready }
 * Native document picking is fulfilled by `pick_document`; the local file path
 * is fed back over the WebRTC DataChannel. */

#[derive(Default)]
struct EngineState {
  stdin: Mutex<Option<ChildStdin>>,
}

/// Resolve (node_exe, entry_js) for the engine — bundled resources in prod,
/// ENGINE_ENTRY env in dev. Returns None when neither is available.
fn resolve_engine(app: &tauri::AppHandle) -> Option<(String, String)> {
  if let Ok(entry) = app
    .path()
    .resolve("resources/automation-core/bin/engine.js", tauri::path::BaseDirectory::Resource)
  {
    if entry.exists() {
      let node = app
        .path()
        .resolve("resources/node/node.exe", tauri::path::BaseDirectory::Resource)
        .ok()
        .filter(|p| p.exists())
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| "node".to_string());
      return Some((node, entry.to_string_lossy().to_string()));
    }
  }
  if let Ok(entry) = std::env::var("ENGINE_ENTRY") {
    let node = std::env::var("ENGINE_NODE").unwrap_or_else(|_| "node".to_string());
    return Some((node, entry));
  }
  // Dev fallback (`tauri dev`, unbundled): walk up from the working dir looking
  // for the sibling automation-core package in the repo.
  if let Ok(mut dir) = std::env::current_dir() {
    for _ in 0..6 {
      let candidate = dir.join("automation-core").join("bin").join("engine.js");
      if candidate.exists() {
        let node = std::env::var("ENGINE_NODE").unwrap_or_else(|_| "node".to_string());
        return Some((node, candidate.to_string_lossy().to_string()));
      }
      if !dir.pop() {
        break;
      }
    }
  }
  None
}

fn spawn_engine(app: tauri::AppHandle) {
  let (node, entry) = match resolve_engine(&app) {
    Some(v) => v,
    None => {
      eprintln!("[engine] not found (no bundled resource, no ENGINE_ENTRY) — automation disabled");
      return;
    }
  };
  let api_base = std::env::var("TAURI_API_URL").unwrap_or_else(|_| "http://localhost:3001".to_string());
  // 'executor' = kiosk runtime (registers as a runner); 'recorder' = admin authoring.
  let role = std::env::var("ENGINE_ROLE").unwrap_or_else(|_| "executor".to_string());
  let browsers = app
    .path()
    .resolve("resources/chromium", tauri::path::BaseDirectory::Resource)
    .ok()
    .filter(|p| p.exists());

  std::thread::spawn(move || loop {
    let mut cmd = Command::new(&node);
    cmd.arg(&entry)
      .env("API_BASE", &api_base)
      .env("ENGINE_ROLE", &role)
      .env("BROWSER_MODE", "hidden")
      .stdin(Stdio::piped())
      .stdout(Stdio::piped())
      .stderr(Stdio::inherit());
    if let Some(b) = &browsers {
      cmd.env("PLAYWRIGHT_BROWSERS_PATH", b);
    }
    match cmd.spawn() {
      Ok(mut child) => {
        if let Some(stdin) = child.stdin.take() {
          if let Some(state) = app.try_state::<EngineState>() {
            *state.stdin.lock().unwrap() = Some(stdin);
          }
        }
        let _ = app.emit("engine://status", serde_json::json!({ "ready": true }));
        if let Some(out) = child.stdout.take() {
          for line in BufReader::new(out).lines().map_while(Result::ok) {
            let trimmed = line.trim();
            if trimmed.is_empty() {
              continue;
            }
            // stdout is the protocol stream (JSON lines); anything else is a log.
            match serde_json::from_str::<serde_json::Value>(trimmed) {
              Ok(value) => { let _ = app.emit("engine://message", value); }
              Err(_) => eprintln!("[engine] {trimmed}"),
            }
          }
        }
        let _ = child.wait();
      }
      Err(e) => eprintln!("[engine] spawn failed: {e}"),
    }
    if let Some(state) = app.try_state::<EngineState>() {
      *state.stdin.lock().unwrap() = None;
    }
    let _ = app.emit("engine://status", serde_json::json!({ "ready": false }));
    eprintln!("[engine] exited — restarting in 3s");
    std::thread::sleep(Duration::from_secs(3));
  });
}

/// Relay one control/signaling message from the WebView to the engine (stdin).
#[tauri::command]
fn engine_send(state: tauri::State<EngineState>, msg: serde_json::Value) -> Result<(), String> {
  let mut guard = state.stdin.lock().map_err(|e| e.to_string())?;
  let stdin = guard
    .as_mut()
    .ok_or_else(|| "Engine tự động hoá chưa sẵn sàng".to_string())?;
  let mut line = serde_json::to_string(&msg).map_err(|e| e.to_string())?;
  line.push('\n');
  stdin.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
  stdin.flush().map_err(|e| e.to_string())?;
  Ok(())
}

/// Toggle overlay mode: while a real chromeless Chromium window is positioned
/// over the kiosk frame, drop the Tauri window's always-on-top so the overlay
/// is visible. Called by the recorder / executor screens on mount/unmount.
#[tauri::command]
fn set_overlay_active(app: tauri::AppHandle, active: bool) {
  OVERLAY_ACTIVE.store(active, Ordering::SeqCst);
  if let Some(window) = app.get_webview_window("main") {
    if active {
      let _ = window.set_always_on_top(false);
    } else {
      // Restore kiosk lock unless we're in dev/windowed mode.
      enforce_kiosk_window(&window);
    }
  }
}

/// Pick a document natively and return its absolute LOCAL path. The engine
/// feeds the path straight into Playwright setInputFiles (no upload/download —
/// same machine). source: 'file' | 'qr' | 'scanner'.
#[tauri::command]
async fn pick_document(app: tauri::AppHandle, source: String) -> Result<serde_json::Value, String> {
  tauri::async_runtime::spawn_blocking(move || match source.as_str() {
    "file" => app
      .dialog()
      .file()
      .blocking_pick_file()
      .and_then(|f| f.as_path().map(|p| p.to_string_lossy().to_string()))
      .map(|path| serde_json::json!({ "path": path }))
      .ok_or_else(|| "cancelled".to_string()),
    _ => Err("Tải tài liệu qua QR/máy quét chưa được cấu hình trên thiết bị này.".to_string()),
  })
  .await
  .map_err(|e| e.to_string())?
}

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .manage(EngineState::default())
    .setup(|app| {
      if let Some(window) = app.get_webview_window("main") {
        enforce_kiosk_window(&window);
      }
      #[cfg(windows)]
      windows_kiosk::install_keyboard_lock();
      spawn_engine(app.handle().clone());
      Ok(())
    })
    .on_window_event(|window, event| match event {
      tauri::WindowEvent::CloseRequested { api, .. } => api.prevent_close(),
      tauri::WindowEvent::Focused(false) => enforce_kiosk_window(window),
      _ => {}
    })
    .invoke_handler(tauri::generate_handler![
      get_device_serial,
      collect_device_metrics,
      lock_kiosk,
      unlock_kiosk,
      clear_session_data,
      restart_app,
      reboot_device,
      shutdown_device,
      health_check,
      voice_start,
      voice_stop,
      engine_send,
      pick_document,
      toggle_dev_window,
      set_overlay_active,
      raise_overlay_browser
    ])
    .run(tauri::generate_context!())
    .expect("error while running smart kiosk");
}
