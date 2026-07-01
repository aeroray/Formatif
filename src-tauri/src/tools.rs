//! Download-on-demand manager for the external CLI tools (ffmpeg, qpdf, …).
//! Tools are NOT bundled in the installer; they download on first use into a
//! `tools/` folder next to the app executable (the install directory), which
//! keeps the installer tiny.

use std::io::Read;
use std::path::PathBuf;

use anyhow::{anyhow, Context, Result};
use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;

struct ManagedTool {
    id: &'static str,
    name: &'static str,
    exe: &'static str,
    url: &'static str,
    /// When true extract every file in the archive's `bin/` dir (e.g. qpdf
    /// ships DLLs next to the exe); otherwise extract only the single exe.
    extract_bin_dir: bool,
    optional: bool,
    /// Compress categories that require this tool.
    categories: &'static [&'static str],
}

const TOOLS: &[ManagedTool] = &[
    ManagedTool {
        id: "ffmpeg",
        name: "ffmpeg",
        exe: "ffmpeg.exe",
        url: "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip",
        extract_bin_dir: false,
        optional: false,
        categories: &["image", "video", "gif"],
    },
    ManagedTool {
        id: "qpdf",
        name: "qpdf",
        exe: "qpdf.exe",
        url: "https://github.com/qpdf/qpdf/releases/download/v11.9.1/qpdf-11.9.1-msvc64.zip",
        extract_bin_dir: true,
        optional: false,
        categories: &["pdf"],
    },
    // gifsicle does the lossy GIF optimisation ffmpeg's encoder can't — a small
    // standalone exe. Used as a post-pass after ffmpeg builds the GIF.
    ManagedTool {
        id: "gifsicle",
        name: "gifsicle",
        exe: "gifsicle.exe",
        url: "https://eternallybored.org/misc/gifsicle/releases/gifsicle-1.95-win64.zip",
        extract_bin_dir: false,
        optional: false,
        categories: &["gif"],
    },
];

fn tool(id: &str) -> Option<&'static ManagedTool> {
    TOOLS.iter().find(|t| t.id == id)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolStatus {
    pub id: String,
    pub name: String,
    pub state: String, // "installed" | "missing"
    pub size_bytes: Option<u64>,
    pub optional: bool,
    pub url: String, // download source
    pub install_path: Option<String>, // where it's installed (when present)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolProgress {
    id: String,
    received: u64,
    total: u64,
    state: String, // "installing" | "installed" | "error"
}

/// `tools/` next to the app executable (install directory). Falls back to the
/// current dir if the exe path can't be resolved.
fn exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

fn tools_root() -> PathBuf {
    exe_dir().join("tools")
}

/// Transient working dir for decoded/rasterised inputs (HEIC/SVG→PNG and PDF
/// rasterise), next to the exe like `tools/`. Nothing here needs to persist —
/// it is wiped on startup and on app exit (see `lib.rs`).
pub fn cache_root() -> PathBuf {
    exe_dir().join("cache")
}

fn tool_dir(id: &str) -> PathBuf {
    tools_root().join(id)
}

/// Resolve the runnable path for a tool: env override → installed copy →
/// bare name on PATH (development convenience).
pub fn resolve_tool(id: &str) -> String {
    let env_key = format!("FORMATIF_{}", id.to_ascii_uppercase());
    if let Ok(p) = std::env::var(&env_key) {
        if !p.trim().is_empty() {
            return p;
        }
    }
    if let Some(t) = tool(id) {
        let candidate = tool_dir(id).join(t.exe);
        if candidate.exists() {
            return candidate.to_string_lossy().into_owned();
        }
    }
    tool(id)
        .map(|t| t.exe.trim_end_matches(".exe").to_string())
        .unwrap_or_else(|| id.to_string())
}

fn is_installed(t: &ManagedTool) -> bool {
    tool_dir(t.id).join(t.exe).exists()
        || std::env::var(format!("FORMATIF_{}", t.id.to_ascii_uppercase()))
            .map(|v| !v.trim().is_empty())
            .unwrap_or(false)
}

fn dir_size(dir: &PathBuf) -> u64 {
    let mut total = 0;
    if let Ok(rd) = std::fs::read_dir(dir) {
        for e in rd.flatten() {
            if let Ok(m) = e.metadata() {
                total += m.len();
            }
        }
    }
    total
}

#[tauri::command]
pub fn tool_status() -> Vec<ToolStatus> {
    TOOLS
        .iter()
        .map(|t| {
            let installed = is_installed(t);
            let dir = tool_dir(t.id);
            let size = if installed {
                let s = dir_size(&dir);
                (s > 0).then_some(s)
            } else {
                None
            };
            ToolStatus {
                id: t.id.to_string(),
                name: t.name.to_string(),
                state: if installed { "installed" } else { "missing" }.to_string(),
                size_bytes: size,
                optional: t.optional,
                url: t.url.to_string(),
                install_path: installed.then(|| dir.to_string_lossy().into_owned()),
            }
        })
        .collect()
}

#[tauri::command]
pub async fn install_tool(app: AppHandle, id: String) -> Result<(), String> {
    install(&app, &id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reinstall_tool(app: AppHandle, id: String) -> Result<(), String> {
    let _ = std::fs::remove_dir_all(tool_dir(&id));
    install(&app, &id).await.map_err(|e| e.to_string())
}

/// Ensure the tools required by the given categories are installed; downloads
/// missing ones. Returns true if all required tools are present afterwards.
#[tauri::command]
pub async fn ensure_tools(app: AppHandle, categories: Vec<String>) -> Result<bool, String> {
    for t in TOOLS {
        if t.optional {
            continue;
        }
        let needed = t.categories.iter().any(|c| categories.iter().any(|x| x == c));
        if needed && !is_installed(t) {
            if let Err(e) = install(&app, t.id).await {
                return Err(e.to_string());
            }
        }
    }
    let ok = TOOLS.iter().filter(|t| !t.optional).all(|t| {
        let needed = t.categories.iter().any(|c| categories.iter().any(|x| x == c));
        !needed || is_installed(t)
    });
    Ok(ok)
}

fn emit_progress(app: &AppHandle, id: &str, received: u64, total: u64, state: &str) {
    let _ = app.emit(
        "tool://progress",
        ToolProgress {
            id: id.to_string(),
            received,
            total,
            state: state.to_string(),
        },
    );
}

async fn install(app: &AppHandle, id: &str) -> Result<()> {
    let t = tool(id).ok_or_else(|| anyhow!("unknown tool: {id}"))?;
    let dir = tool_dir(id);
    std::fs::create_dir_all(&dir)
        .with_context(|| format!("cannot create {}", dir.display()))?;

    emit_progress(app, id, 0, 0, "installing");

    let tmp = dir.join("download.tmp");
    let resp = reqwest::get(t.url)
        .await
        .with_context(|| format!("download {} failed", t.name))?
        .error_for_status()
        .with_context(|| format!("download {} failed", t.name))?;
    let total = resp.content_length().unwrap_or(0);
    {
        let mut file = tokio::fs::File::create(&tmp).await?;
        let mut stream = resp.bytes_stream();
        let mut received: u64 = 0;
        let mut last = 0u64;
        while let Some(chunk) = stream.next().await {
            let chunk = chunk.context("download interrupted")?;
            file.write_all(&chunk).await?;
            received += chunk.len() as u64;
            if received - last > 500_000 {
                last = received;
                emit_progress(app, id, received, total, "installing");
            }
        }
        file.flush().await?;
    }

    let dir2 = dir.clone();
    let tmp2 = tmp.clone();
    let exe = t.exe.to_string();
    let extract_dir = t.extract_bin_dir;
    let result = tauri::async_runtime::spawn_blocking(move || {
        extract_zip(&tmp2, &dir2, &exe, extract_dir)
    })
    .await
    .map_err(|e| anyhow!(e))?;
    let _ = std::fs::remove_file(&tmp);
    if let Err(e) = result {
        emit_progress(app, id, 0, 0, "error");
        return Err(e);
    }

    emit_progress(app, id, total, total, "installed");
    Ok(())
}

/// Whether a zip entry (forward-slashed `name`) should be extracted.
/// `extract_bin_dir` true → every file directly inside a `bin/` dir (qpdf ships
/// its DLLs there); false → just the single `exe`, whether at the archive root
/// (gifsicle), under `bin/`, or any nested dir (ffmpeg's `*/bin/ffmpeg.exe`).
fn archive_wants(name: &str, exe: &str, extract_bin_dir: bool) -> bool {
    if extract_bin_dir {
        match name.rfind("/bin/") {
            Some(pos) => {
                let rel = &name[pos + 5..];
                !rel.is_empty() && !rel.contains('/')
            }
            None => false,
        }
    } else {
        name == exe || name.ends_with(&format!("/{exe}"))
    }
}

fn extract_zip(zip_path: &PathBuf, dest: &PathBuf, exe: &str, extract_bin_dir: bool) -> Result<()> {
    std::fs::create_dir_all(dest)?;
    let f = std::fs::File::open(zip_path)?;
    let mut zip = zip::ZipArchive::new(f)?;

    let mut wrote_exe = false;
    for i in 0..zip.len() {
        let mut entry = zip.by_index(i)?;
        if entry.is_dir() {
            continue;
        }
        let name = entry.name().replace('\\', "/");
        if !archive_wants(&name, exe, extract_bin_dir) {
            continue;
        }
        let filename = name.rsplit('/').next().unwrap_or(exe);
        let out = dest.join(filename);
        let mut buf = Vec::with_capacity(entry.size() as usize);
        entry.read_to_end(&mut buf)?;
        std::fs::write(&out, &buf)?;
        if filename == exe {
            wrote_exe = true;
        }
        if !extract_bin_dir {
            wrote_exe = true;
            break;
        }
    }

    if !wrote_exe {
        return Err(anyhow!("{exe} not found in archive"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn single_exe_matches_root_and_nested() {
        // gifsicle ships gifsicle.exe at the archive root (no path prefix).
        assert!(archive_wants("gifsicle.exe", "gifsicle.exe", false));
        // ffmpeg is nested under a versioned dir's bin/.
        assert!(archive_wants(
            "ffmpeg-release-essentials/bin/ffmpeg.exe",
            "ffmpeg.exe",
            false
        ));
        // Sibling exes and docs in the same archive are left out.
        assert!(!archive_wants("gifdiff.exe", "gifsicle.exe", false));
        assert!(!archive_wants("doc/gifsicle.html", "gifsicle.exe", false));
    }

    #[test]
    fn bin_dir_mode_takes_every_file_in_bin() {
        // qpdf needs its exe *and* the DLLs sitting next to it.
        assert!(archive_wants("qpdf-11.9.1/bin/qpdf.exe", "qpdf.exe", true));
        assert!(archive_wants("qpdf-11.9.1/bin/libqpdf.dll", "qpdf.exe", true));
        // Files outside bin/ (and nested below it) are excluded.
        assert!(!archive_wants("qpdf-11.9.1/doc/readme.txt", "qpdf.exe", true));
        assert!(!archive_wants("qpdf-11.9.1/bin/sub/x.dll", "qpdf.exe", true));
    }

    #[test]
    fn gifsicle_is_registered_for_gif() {
        let g = tool("gifsicle").expect("gifsicle registered");
        assert_eq!(g.exe, "gifsicle.exe");
        assert!(g.categories.contains(&"gif"));
        assert!(!g.optional);
    }
}
