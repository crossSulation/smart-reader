use chrono::Utc;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use std::path::PathBuf;
use tauri::{
    image::Image,
    menu::{CheckMenuItemBuilder, MenuBuilder, SubmenuBuilder},
    Manager,
};

struct CacheDb(sqlx::SqlitePool);

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

#[tauri::command]
async fn cache_file(db: tauri::State<'_, CacheDb>, url: String, data: Vec<u8>) -> Result<(), String> {
    sqlx::query("INSERT OR REPLACE INTO file_cache (url, data, cached_at) VALUES (?, ?, ?)")
        .bind(&url)
        .bind(&data)
        .bind(Utc::now().timestamp_millis())
        .execute(&db.0)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_cached_file(db: tauri::State<'_, CacheDb>, url: String) -> Result<Option<Vec<u8>>, String> {
    let result = sqlx::query_scalar::<_, Vec<u8>>("SELECT data FROM file_cache WHERE url = ?")
        .bind(&url)
        .fetch_optional(&db.0)
        .await
        .map_err(|e| e.to_string())?;
    Ok(result)
}

#[tauri::command]
async fn clear_file_cache(db: tauri::State<'_, CacheDb>) -> Result<(), String> {
    sqlx::query("DELETE FROM file_cache")
        .execute(&db.0)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn get_cache_size(db: tauri::State<'_, CacheDb>) -> Result<i64, String> {
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM file_cache")
        .fetch_one(&db.0)
        .await
        .map_err(|e| e.to_string())?;
    Ok(count.0)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let mut cache_path = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("."));
            std::fs::create_dir_all(&cache_path).ok();
            cache_path.push("cache.db");

            let pool = tauri::async_runtime::block_on(
                SqlitePoolOptions::new()
                    .max_connections(4)
                    .connect_with(
                        SqliteConnectOptions::new()
                            .filename(&cache_path)
                            .create_if_missing(true),
                    ),
            )
            .expect("Failed to create cache database");

            tauri::async_runtime::block_on(
                sqlx::query(
                    "CREATE TABLE IF NOT EXISTS file_cache (
                        url TEXT PRIMARY KEY,
                        data BLOB NOT NULL,
                        cached_at INTEGER NOT NULL
                    )",
                )
                .execute(&pool),
            )
            .expect("Failed to create file_cache table");

            app.manage(CacheDb(pool));

            let menu_image = Image::from_bytes(include_bytes!("../icons/icon.png")).unwrap();
            let file_menu = SubmenuBuilder::new(app, "File")
                .submenu_icon(menu_image)
                .text("open", "Open")
                .text("exit", "Exit")
                .build()?;
            let language_str = "en";

            let check_sub_item_en = CheckMenuItemBuilder::new("English")
                .id("en")
                .checked(language_str == "en")
                .build(app)?;
            let check_sub_item_zh = CheckMenuItemBuilder::new("Chinese")
                .id("zh")
                .checked(language_str == "zh")
                .enabled(false)
                .build(app)?;
            let language_menu = SubmenuBuilder::new(app, "Language")
                .item(&check_sub_item_en)
                .item(&check_sub_item_zh)
                .build()?;
            let menu = MenuBuilder::new(app)
                .items(&[&file_menu, &language_menu])
                .build()?;
            let _ = app.set_menu(menu);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            is_desktop,
            get_env,
            cache_file,
            get_cached_file,
            clear_file_cache,
            get_cache_size
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
