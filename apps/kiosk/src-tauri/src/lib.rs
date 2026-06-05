use serde::Serialize;
use sysinfo::{Components, Disks, System};

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
  network: String,
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
    network: "native".to_string(),
  }
}

#[tauri::command]
fn lock_kiosk() -> serde_json::Value {
  serde_json::json!({ "locked": true })
}

#[tauri::command]
fn unlock_kiosk() -> serde_json::Value {
  serde_json::json!({ "locked": false })
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

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .invoke_handler(tauri::generate_handler![
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
