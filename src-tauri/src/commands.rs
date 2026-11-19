use lingforge_core::APPLICATION_NAME;
use serde::Serialize;

/// Read-only application metadata. No filesystem paths or environment values
/// cross this command. Project operations use separate workspace services.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationInfo {
    name: &'static str,
    version: &'static str,
    platform: &'static str,
}

#[tauri::command]
pub fn application_info() -> ApplicationInfo {
    ApplicationInfo {
        name: APPLICATION_NAME,
        version: env!("CARGO_PKG_VERSION"),
        platform: std::env::consts::OS,
    }
}
