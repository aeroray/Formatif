mod args;
mod commands;
mod ffmpeg;
mod state;
mod tools;
mod watcher;

use state::AppState;
use watcher::WatcherState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .app_name("Formatif")
                .build(),
        )
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(AppState::new())
        .manage(WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            commands::expand_paths,
            commands::compress_files,
            commands::cancel_job,
            commands::cancel_all,
            commands::thumbnail,
            commands::read_data_url,
            commands::path_exists,
            commands::write_temp,
            commands::set_prevent_sleep,
            watcher::update_watcher,
            tools::tool_status,
            tools::install_tool,
            tools::reinstall_tool,
            tools::ensure_tools,
        ])
        .setup(|app| {
            // The frosted-glass look is done entirely in CSS (backdrop-filter),
            // so there's no OS-specific window backdrop to apply here.
            // Clear any transient decode/rasterise cache a previous session may
            // have left behind (e.g. after a crash) — it never needs to persist.
            let _ = std::fs::remove_dir_all(tools::cache_root());
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Wipe the transient cache when the app closes — nothing there needs to
    // outlive the session.
    app.run(|_app_handle, event| {
        if matches!(
            event,
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
        ) {
            let _ = std::fs::remove_dir_all(tools::cache_root());
        }
    });
}
