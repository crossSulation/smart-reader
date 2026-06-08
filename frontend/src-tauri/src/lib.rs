use tauri::{
    image::Image,
    menu::{CheckMenuItemBuilder, MenuBuilder, SubmenuBuilder},
};
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
        .setup(move |app| {
            let menu_image = Image::from_bytes(include_bytes!("../icons/icon.png")).unwrap();
            let file_menu = SubmenuBuilder::new(app, "File")
                .submenu_icon(menu_image)
                .text("open", "Open")
                .text("exit", "Exit")
                .build()?;
            let language_str ="en";
            
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
        .invoke_handler(tauri::generate_handler![is_desktop, get_env])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
