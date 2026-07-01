//! Folder watcher: watches configured folders and auto-compresses newly added
//! media files using the per-category presets. Loop-safe — it ignores the
//! output files it produces (both by exact path and by output-name marker).

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use anyhow::{anyhow, Context, Result};
use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, Notify};

use crate::args::{build_args, output_ext, CompressionSpec};
use crate::commands::{copy_mtime, guard_no_growth};
use crate::ffmpeg::{self, command};
use crate::state::AppState;
use crate::tools::resolve_tool;

const IMAGE_EXTS: &[&str] = &[
    "jpg", "jpeg", "png", "webp", "bmp", "tiff", "tif", "avif", "ico", "tga", "jp2", "j2k",
    "jpeg2000", "heic", "heif", "svg", "psd",
];
const VIDEO_EXTS: &[&str] = &[
    "mp4", "mov", "mkv", "avi", "webm", "flv", "wmv", "m4v", "mpg", "mpeg", "ts", "m2ts", "3gp",
    "3g2", "ogv",
];

/// Map a file extension to one of the four categories, or None if unsupported.
fn category_of(ext: &str) -> Option<&'static str> {
    let e = ext.to_ascii_lowercase();
    if e == "gif" {
        Some("gif")
    } else if e == "pdf" {
        Some("pdf")
    } else if IMAGE_EXTS.contains(&e.as_str()) {
        Some("image")
    } else if VIDEO_EXTS.contains(&e.as_str()) {
        Some("video")
    } else {
        None
    }
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WatchOutput {
    pub dir: Option<String>,
    pub name_template: String,
    #[serde(default)]
    pub remove_original: bool,
    #[serde(default)]
    pub fs_metadata: bool,
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct WatchConfig {
    pub enabled: bool,
    pub folders: Vec<String>,
    pub max_depth: u32,
    /// category -> whether to process it.
    pub types: HashMap<String, bool>,
    /// category -> compression spec to apply.
    pub specs: HashMap<String, CompressionSpec>,
    pub output: WatchOutput,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WatchDonePayload {
    input: String,
    output: String,
    original_size: u64,
    output_size: u64,
}

/// Holds the live OS watcher; dropping it stops all watches and (by dropping
/// the event sender) tells the processor task to exit.
#[derive(Default)]
pub struct WatcherState(pub Mutex<Option<Active>>);

pub struct Active {
    _watcher: RecommendedWatcher,
    stop: Arc<Notify>,
}

/// (Re)configure the folder watcher. Tearing down the previous watcher and
/// starting a fresh one keeps the implementation simple and race-free.
#[tauri::command]
pub fn update_watcher(app: AppHandle, config: WatchConfig) -> Result<(), String> {
    let state = app.state::<WatcherState>();
    let mut guard = state.0.lock().unwrap();

    if let Some(active) = guard.take() {
        active.stop.notify_waiters();
        // Dropping `active` drops the watcher (stops OS watches) and its event
        // sender, so the old processor task's channel closes and it exits.
    }

    if !config.enabled || config.folders.is_empty() {
        return Ok(());
    }

    let cfg = Arc::new(config);
    let (tx, rx) = mpsc::unbounded_channel::<PathBuf>();
    let tx_sweep = tx.clone(); // for the initial sweep of existing files

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<Event>| {
        if let Ok(ev) = res {
            if matches!(ev.kind, EventKind::Create(_) | EventKind::Modify(_)) {
                for p in ev.paths {
                    let _ = tx.send(p);
                }
            }
        }
    })
    .map_err(|e| e.to_string())?;

    // notify can only watch recursively or not; for depths >= 1 we watch
    // recursively and filter by computed depth when an event arrives.
    let mode = if cfg.max_depth >= 1 {
        RecursiveMode::Recursive
    } else {
        RecursiveMode::NonRecursive
    };
    for f in &cfg.folders {
        let _ = watcher.watch(Path::new(f), mode);
    }

    let stop = Arc::new(Notify::new());
    let stop_for_task = stop.clone();
    let cfg_for_task = cfg.clone();
    let app_for_task = app.clone();
    tauri::async_runtime::spawn(async move {
        run_processor(app_for_task, rx, stop_for_task, cfg_for_task).await;
    });

    // Initial sweep: feed existing files (within the allowed depth) through the
    // same pipeline so enabling a watch also compresses what's already there.
    // Already-compressed files are skipped downstream (output exists / marker).
    let folders = cfg.folders.clone();
    let depth = cfg.max_depth;
    tauri::async_runtime::spawn_blocking(move || {
        for f in &folders {
            sweep_dir(Path::new(f), 0, depth, &tx_sweep);
        }
    });

    *guard = Some(Active {
        _watcher: watcher,
        stop,
    });
    Ok(())
}

/// Recursively enqueue existing files (depth-limited) for the initial sweep.
fn sweep_dir(dir: &Path, depth: u32, max_depth: u32, tx: &mpsc::UnboundedSender<PathBuf>) {
    if let Ok(rd) = std::fs::read_dir(dir) {
        for entry in rd.flatten() {
            let p = entry.path();
            if p.is_dir() {
                if depth < max_depth {
                    sweep_dir(&p, depth + 1, max_depth, tx);
                }
            } else if p.is_file() {
                let _ = tx.send(p);
            }
        }
    }
}

/// Drain filesystem events, debounce them (a file is processed only after it
/// has been quiet for a short window — so we don't grab half-written files),
/// then dispatch each eligible file to a bounded compression worker.
async fn run_processor(
    app: AppHandle,
    mut rx: mpsc::UnboundedReceiver<PathBuf>,
    stop: Arc<Notify>,
    cfg: Arc<WatchConfig>,
) {
    let outputs: Arc<Mutex<HashSet<PathBuf>>> = Arc::new(Mutex::new(HashSet::new()));
    let marker = output_name_marker(&cfg.output.name_template);
    let mut pending: HashMap<PathBuf, Instant> = HashMap::new();
    let mut ticker = tokio::time::interval(Duration::from_millis(500));
    const QUIET: Duration = Duration::from_millis(800);

    loop {
        tokio::select! {
            _ = stop.notified() => break,
            recv = rx.recv() => match recv {
                Some(p) => { pending.insert(p, Instant::now()); }
                None => break, // sender dropped -> watcher torn down
            },
            _ = ticker.tick() => {
                let now = Instant::now();
                let ready: Vec<PathBuf> = pending
                    .iter()
                    .filter(|(_, t)| now.duration_since(**t) >= QUIET)
                    .map(|(p, _)| p.clone())
                    .collect();
                for p in ready {
                    pending.remove(&p);
                    if !eligible(&p, &cfg, marker.as_deref(), &outputs) {
                        continue;
                    }
                    let app2 = app.clone();
                    let cfg2 = cfg.clone();
                    let outs2 = outputs.clone();
                    tauri::async_runtime::spawn(async move {
                        compress_one(app2, p, cfg2, outs2).await;
                    });
                }
            }
        }
    }
}

/// Whether a path should be auto-compressed: an existing file, within the
/// allowed depth, of an enabled category, that isn't one of our own outputs.
fn eligible(
    path: &Path,
    cfg: &WatchConfig,
    marker: Option<&str>,
    outputs: &Arc<Mutex<HashSet<PathBuf>>>,
) -> bool {
    if !path.is_file() {
        return false;
    }
    if outputs.lock().unwrap().contains(path) {
        return false;
    }
    if let Some(m) = marker {
        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
            if stem.contains(m) {
                return false;
            }
        }
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let Some(category) = category_of(&ext) else {
        return false;
    };
    if !cfg.types.get(category).copied().unwrap_or(true) {
        return false;
    }
    within_depth(path, &cfg.folders, cfg.max_depth)
}

/// True if `path` sits at most `max_depth` sub-directories below one of the
/// watched roots (a direct child file is depth 0).
fn within_depth(path: &Path, folders: &[String], max_depth: u32) -> bool {
    for f in folders {
        if let Ok(rel) = path.strip_prefix(Path::new(f)) {
            let depth = rel.components().count().saturating_sub(1) as u32;
            return depth <= max_depth;
        }
    }
    false
}

/// The static portion of the name template (placeholders removed). Used to skip
/// files that look like our own output even across restarts. Returns None when
/// it has no letters/digits (too generic to match safely).
fn output_name_marker(template: &str) -> Option<String> {
    let m = template
        .replace("{input}", "")
        .replace("(input)", "")
        .replace("{ext}", "")
        .replace("{format}", "")
        .replace("{quality}", "")
        .replace("(quality)", "")
        .replace("{resolution}", "")
        .replace("{folder}", "")
        .replace("{date}", "")
        .replace("{time}", "")
        .trim()
        .to_string();
    if m.chars().any(|c| c.is_ascii_alphanumeric()) {
        Some(m)
    } else {
        None
    }
}

/// The deterministic output path for a watched file (no collision-renaming).
/// Returns None if that path already exists, signalling "already processed".
fn watch_output(
    input: &str,
    ext: &str,
    out_dir: Option<&str>,
    template: &str,
    quality: &str,
    resolution: &str,
) -> Option<PathBuf> {
    let in_path = Path::new(input);
    let stem = in_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("output");
    let dir: PathBuf = match out_dir {
        Some(d) if !d.is_empty() => PathBuf::from(d),
        _ => in_path
            .parent()
            .map(Path::to_path_buf)
            .unwrap_or_else(|| PathBuf::from(".")),
    };
    let mut base = if template.trim().is_empty() {
        stem.to_string()
    } else {
        crate::commands::apply_name_template(template, in_path, ext, quality, resolution)
    };
    base = base.replace(['/', '\\', ':'], "_");
    if base.is_empty() {
        base = stem.to_string();
    }
    let candidate = dir.join(format!("{base}.{ext}"));
    if candidate.exists() {
        None
    } else {
        Some(candidate)
    }
}

/// Compress a single watched file with its category preset.
async fn compress_one(
    app: AppHandle,
    input: PathBuf,
    cfg: Arc<WatchConfig>,
    outputs: Arc<Mutex<HashSet<PathBuf>>>,
) {
    let ext = input
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let Some(category) = category_of(&ext) else {
        return;
    };
    let Some(spec) = cfg.specs.get(category).cloned() else {
        return;
    };

    let sem = app.state::<AppState>().sem.clone();
    let _permit = match sem.acquire_owned().await {
        Ok(p) => p,
        Err(_) => return,
    };

    let input_str = input.to_string_lossy().into_owned();
    let original_size = std::fs::metadata(&input).map(|m| m.len()).unwrap_or(0);
    let out_ext = output_ext(category, &spec, &ext);
    // Deterministic output path; if it already exists, the file was already
    // processed — skip it (this keeps re-enabling a watch idempotent).
    let Some(output) = watch_output(
        &input_str,
        &out_ext,
        cfg.output.dir.as_deref(),
        &cfg.output.name_template,
        &spec.quality,
        &crate::commands::resolution_label(&spec.resolution),
    ) else {
        return;
    };
    let output_str = output.to_string_lossy().into_owned();

    // Remember the output up-front so its own create event is ignored.
    outputs.lock().unwrap().insert(output.clone());

    let result: Result<u64> = if spec.quality == "original" && spec.format == "original" {
        // fs::copy returns the byte count, which is the output size.
        std::fs::copy(&input_str, &output_str).map_err(|e| anyhow!(e.to_string()))
    } else if category == "pdf" {
        run_qpdf(&input_str, &output_str, &spec).await
    } else {
        let ffmpeg = resolve_tool("ffmpeg");
        let total = ffmpeg::probe_duration(&ffmpeg, &input_str).await.unwrap_or(0.0);
        // Cap video bitrate below the source (computed from size + duration).
        let src_kbps = if category == "video" && spec.quality != "original" && total > 0.5 {
            Some(((original_size as f64) * 8.0 / total / 1000.0) as u64)
        } else {
            None
        };
        let out_args = build_args(category, &spec, &ext, src_kbps);
        ffmpeg::transcode(
            &ffmpeg,
            &input_str,
            &output_str,
            &out_args,
            total,
            Arc::new(Notify::new()),
            |_pct| {},
        )
        .await
    };

    match result {
        Ok(output_size) => {
            let output_size =
                guard_no_growth(&input_str, &output_str, &spec.quality, &spec.format, output_size);
            if cfg.output.fs_metadata {
                copy_mtime(&input_str, &output_str);
            }
            if cfg.output.remove_original && Path::new(&input_str) != Path::new(&output_str) {
                let _ = std::fs::remove_file(&input_str);
            }
            let _ = app.emit(
                "watch://compressed",
                WatchDonePayload {
                    input: input_str,
                    output: output_str,
                    original_size,
                    output_size,
                },
            );
        }
        Err(_) => {
            // Failed/partial output was cleaned up by the runner; forget it.
            outputs.lock().unwrap().remove(&output);
        }
    }
}

/// qpdf lossless recompression (mirrors the interactive path, minus events).
async fn run_qpdf(input: &str, output: &str, spec: &CompressionSpec) -> Result<u64> {
    let qpdf = resolve_tool("qpdf");
    let mut args: Vec<String> = vec![
        "--object-streams=generate".into(),
        "--recompress-flate".into(),
        "--compression-level=9".into(),
    ];
    if spec.quality != "original" {
        args.push("--optimize-images".into());
    }
    args.push(input.to_string());
    args.push(output.to_string());

    let out = command(&qpdf)
        .args(&args)
        .output()
        .await
        .with_context(|| "could not start qpdf")?;
    let code = out.status.code().unwrap_or(-1);
    if code == 0 || code == 3 {
        Ok(std::fs::metadata(output).map(|m| m.len()).unwrap_or(0))
    } else {
        let _ = std::fs::remove_file(output);
        Err(anyhow!(String::from_utf8_lossy(&out.stderr).trim().to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marker_extracts_static_suffix() {
        assert_eq!(output_name_marker("{input}_compressed").as_deref(), Some("_compressed"));
        // legacy ()-form still recognised
        assert_eq!(output_name_marker("(input)_compressed").as_deref(), Some("_compressed"));
        assert_eq!(output_name_marker("{input}").as_deref(), None);
        assert_eq!(output_name_marker("{input}_{quality}").as_deref(), None);
        // new tokens are stripped too; static text still yields a marker
        assert_eq!(
            output_name_marker("{input}_{date}_compressed").as_deref(),
            Some("__compressed")
        );
        assert_eq!(output_name_marker("{folder}_{input}.{ext}").as_deref(), None);
    }

    #[test]
    fn depth_is_relative_to_root() {
        let folders = vec!["C:\\watch".to_string()];
        assert!(within_depth(Path::new("C:\\watch\\a.png"), &folders, 0));
        assert!(!within_depth(Path::new("C:\\watch\\sub\\a.png"), &folders, 0));
        assert!(within_depth(Path::new("C:\\watch\\sub\\a.png"), &folders, 1));
        assert!(!within_depth(Path::new("C:\\other\\a.png"), &folders, 99));
    }

    #[test]
    fn categories_match_frontend() {
        assert_eq!(category_of("png"), Some("image"));
        assert_eq!(category_of("HEIC"), Some("image"));
        assert_eq!(category_of("mp4"), Some("video"));
        assert_eq!(category_of("gif"), Some("gif"));
        assert_eq!(category_of("pdf"), Some("pdf"));
        assert_eq!(category_of("txt"), None);
    }
}
