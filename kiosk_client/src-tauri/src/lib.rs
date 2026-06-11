use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use sysinfo::{Components, Disks, System};
use tauri::Manager;

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
  window.kiosk_decorations(false);
  window.kiosk_resizable(false);
  window.kiosk_always_on_top(true);
  window.kiosk_skip_taskbar(true);
  window.kiosk_fullscreen(true);
  window.kiosk_focus();
}

#[cfg(windows)]
mod windows_kiosk {
  use std::ptr;
  use windows_sys::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
  use windows_sys::Win32::UI::Input::KeyboardAndMouse::{
    GetAsyncKeyState, VK_CONTROL, VK_ESCAPE, VK_F4, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT, VK_TAB,
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
      let blocked = key == VK_LWIN
        || key == VK_RWIN
        || (key == VK_TAB && alt)
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

pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if let Some(window) = app.get_webview_window("main") {
        enforce_kiosk_window(&window);
      }
      #[cfg(windows)]
      windows_kiosk::install_keyboard_lock();
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
      health_check
    ])
    .run(tauri::generate_context!())
    .expect("error while running smart kiosk");
}
