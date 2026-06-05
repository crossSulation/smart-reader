#[tauri::command]
fn is_desktop() -> bool {
    true
}

#[tauri::command]
fn get_env() -> &'static str {
    if cfg!(debug_assertions) {
        "development"
    } else {
        "production"
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![is_desktop, get_env])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
