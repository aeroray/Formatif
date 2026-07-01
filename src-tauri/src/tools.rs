//! Resolves paths to the external CLI tools (ffmpeg, qpdf, gifsicle) bundled
//! with the app as Tauri resources — see `tauri.windows.conf.json` /
//! `tauri.macos.conf.json`, which stage them into a `tools/` resource dir at
//! build time. Nothing is downloaded at runtime.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// The bundled `tools/` resource dir, if resources were staged for this build
/// (dev runs skip staging, so this is `None` there — callers fall back to
/// PATH, e.g. mise's ffmpeg).
fn bundled_tool_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path().resource_dir().ok().map(|d| d.join("tools"))
}

/// Resolve the runnable path for a tool: env override → bundled resource →
/// bare name on PATH (development convenience).
pub fn resolve_tool(app: &AppHandle, id: &str) -> String {
    let env_key = format!("FORMATIF_{}", id.to_ascii_uppercase());
    if let Ok(p) = std::env::var(&env_key) {
        if !p.trim().is_empty() {
            return p;
        }
    }
    let exe = if cfg!(windows) {
        format!("{id}.exe")
    } else {
        id.to_string()
    };
    if let Some(dir) = bundled_tool_dir(app) {
        let candidate = dir.join(&exe);
        if candidate.exists() {
            return candidate.to_string_lossy().into_owned();
        }
    }
    exe
}

/// Transient working dir for decoded/rasterised inputs (HEIC/SVG→PNG and PDF
/// rasterise), next to the app executable. Nothing here needs to persist — it
/// is wiped on startup and on app exit (see `lib.rs`).
pub fn cache_root() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
        .join("cache")
}
