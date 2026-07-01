//! Tauri command surface invoked from the React frontend.

use std::path::{Path, PathBuf};
use std::time::Instant;

use anyhow::{anyhow, Context, Result};
use base64::Engine;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::args::{build_args, output_ext, CompressionSpec};
use crate::ffmpeg::{self, command, CanceledPayload, DonePayload, ErrorPayload};
use crate::state::AppState;
use crate::tools::resolve_tool;

const VIDEO_EXTS: &[&str] = &[
    "mp4", "mov", "mkv", "avi", "webm", "flv", "wmv", "m4v", "mpg", "mpeg", "ts", "m2ts",
    "3gp", "3g2", "ogv",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FsEntry {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub from_folder: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompressJob {
    pub id: String,
    pub input: String,
    // Original source path, used only for output naming/location when `input`
    // is a decoded temp file (HEIC/SVG → PNG). Defaults to `input`.
    #[serde(default)]
    pub original_input: Option<String>,
    pub category: String,
    pub spec: CompressionSpec,
    #[serde(default)]
    pub output_dir: Option<String>,
    pub name_template: String,
    pub remove_original: bool,
    pub fs_metadata: bool,
}

/// Expand dropped paths into a flat file list. Dropped files are always
/// included; dropped folders are descended at most `max_depth` levels.
#[tauri::command]
pub async fn expand_paths(paths: Vec<String>, max_depth: u32) -> Result<Vec<FsEntry>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut out = Vec::new();
        for p in &paths {
            let path = Path::new(p);
            if path.is_dir() {
                walk_dir(path, 0, max_depth, &mut out);
            } else if path.is_file() {
                push_file(path, false, &mut out);
            }
        }
        out
    })
    .await
    .map_err(|e| e.to_string())
}

const MAX_FILES: usize = 5000;

fn push_file(path: &Path, from_folder: bool, out: &mut Vec<FsEntry>) {
    if out.len() >= MAX_FILES {
        return;
    }
    let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_string();
    out.push(FsEntry {
        path: path.to_string_lossy().into_owned(),
        name,
        size,
        from_folder,
    });
}

/// Walk a folder, including direct files always and descending subfolders only
/// while `depth < max_depth` (so `max_depth = 0` = top level only).
fn walk_dir(dir: &Path, depth: u32, max_depth: u32, out: &mut Vec<FsEntry>) {
    if out.len() >= MAX_FILES {
        return;
    }
    if let Ok(rd) = std::fs::read_dir(dir) {
        let mut children: Vec<PathBuf> = rd.flatten().map(|e| e.path()).collect();
        children.sort();
        for child in children {
            if child.is_dir() {
                if depth < max_depth {
                    walk_dir(&child, depth + 1, max_depth, out);
                }
            } else if child.is_file() {
                push_file(&child, true, out);
            }
        }
    }
}

/// Run compression jobs: a bounded worker per job; emits compress events.
#[tauri::command]
pub async fn compress_files(app: AppHandle, jobs: Vec<CompressJob>) -> Result<(), String> {
    for job in jobs {
        spawn_compress(app.clone(), job);
    }
    Ok(())
}

fn ext_of(path: &str) -> String {
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
}

/// Source overall bitrate (kbit/s) for a video, used to cap the encode below
/// it. None for non-video, "original" quality, or when duration is unknown.
pub(crate) async fn source_kbps(
    ffmpeg: &str,
    category: &str,
    quality: &str,
    input: &str,
) -> Option<u64> {
    if category != "video" || quality == "original" {
        return None;
    }
    let dur = ffmpeg::probe_duration(ffmpeg, input).await?;
    if dur <= 0.5 {
        return None;
    }
    let bytes = std::fs::metadata(input).ok()?.len();
    Some(((bytes as f64) * 8.0 / dur / 1000.0) as u64)
}

/// If a same-format re-encode ended up >= the source, restore the original
/// bytes so a "compressed" file is never larger than the input. Returns the
/// effective output size.
pub(crate) fn guard_no_growth(
    input: &str,
    output: &str,
    quality: &str,
    format: &str,
    size: u64,
) -> u64 {
    if quality == "original" || format != "original" {
        return size;
    }
    let in_size = std::fs::metadata(input).map(|m| m.len()).unwrap_or(0);
    if in_size > 0 && size >= in_size && Path::new(input) != Path::new(output) {
        if std::fs::copy(input, output).is_ok() {
            return in_size;
        }
    }
    size
}

fn spawn_compress(app: AppHandle, job: CompressJob) {
    tauri::async_runtime::spawn(async move {
        let sem = app.state::<AppState>().sem.clone();
        let _permit = match sem.acquire_owned().await {
            Ok(p) => p,
            Err(_) => return,
        };

        let started = Instant::now();
        let naming = job.original_input.clone().unwrap_or_else(|| job.input.clone());
        let input_ext = ext_of(&job.input);
        let ext = output_ext(&job.category, &job.spec, &input_ext);
        let output = output_path(
            &naming,
            &ext,
            job.output_dir.as_deref(),
            &job.name_template,
            &job.spec.quality,
            &resolution_label(&job.spec.resolution),
        );
        let output_str = output.to_string_lossy().into_owned();

        let result: Result<u64> = if job.spec.quality == "original" && job.spec.format == "original"
        {
            // "Original" quality + original format = no compression: copy as-is.
            std::fs::copy(&job.input, &output_str).map_err(|e| anyhow!(e.to_string()))
        } else if job.category == "pdf" {
            run_qpdf(&app, &job, &output_str).await
        } else {
            let ffmpeg = resolve_tool(&app, "ffmpeg");
            // For video, probe the source bitrate so the encoder can cap below it.
            let src_kbps = source_kbps(&ffmpeg, &job.category, &job.spec.quality, &job.input).await;
            let out_args = build_args(&job.category, &job.spec, &input_ext, src_kbps);
            ffmpeg::compress(
                app.clone(),
                job.id.clone(),
                ffmpeg,
                job.input.clone(),
                output_str.clone(),
                out_args,
            )
            .await
        };

        match result {
            Ok(size) => {
                // GIF: gifsicle does the lossy optimisation ffmpeg's encoder
                // can't. Re-encoding an already-optimised GIF tends to *grow*
                // it, so without this pass a same-format GIF would just be
                // reverted by guard_no_growth below ("no compression"). The
                // ffmpeg step already applied fps/scale/palette; gifsicle adds
                // lossy + -O3 in place. Best-effort: keep ffmpeg's output if
                // gifsicle is missing or fails.
                let size = if ext == "gif" && job.spec.quality != "original" {
                    optimize_gif(&app, &job.spec.quality, &output_str).await.unwrap_or(size)
                } else {
                    size
                };
                // Never emit a result larger than the source for a same-format
                // re-encode — fall back to the original bytes if it grew.
                let size = guard_no_growth(
                    &job.input,
                    &output_str,
                    &job.spec.quality,
                    &job.spec.format,
                    size,
                );
                if job.fs_metadata {
                    copy_mtime(&job.input, &output_str);
                }
                if job.remove_original && Path::new(&job.input) != Path::new(&output_str) {
                    let _ = std::fs::remove_file(&job.input);
                }
                let _ = app.emit(
                    "compress://done",
                    DonePayload {
                        id: job.id,
                        output_path: output_str,
                        output_size: size,
                        elapsed_ms: started.elapsed().as_millis() as u64,
                    },
                );
            }
            Err(e) => {
                let msg = e.to_string();
                if msg == "canceled" {
                    let _ = app.emit("compress://canceled", CanceledPayload { id: job.id });
                } else {
                    let _ = app.emit(
                        "compress://error",
                        ErrorPayload {
                            id: job.id,
                            message: msg,
                        },
                    );
                }
            }
        }
    });
}

async fn run_qpdf(app: &AppHandle, job: &CompressJob, output: &str) -> Result<u64> {
    let qpdf = resolve_tool(app, "qpdf");
    let mut args: Vec<String> = vec![
        "--object-streams=generate".into(),
        "--recompress-flate".into(),
        "--compression-level=9".into(),
    ];
    if job.spec.quality != "original" {
        args.push("--optimize-images".into());
    }
    args.push(job.input.clone());
    args.push(output.to_string());

    let out = command(&qpdf)
        .args(&args)
        .output()
        .await
        .with_context(|| "could not start qpdf")?;
    // qpdf: 0 = success, 3 = warnings (output still produced).
    let code = out.status.code().unwrap_or(-1);
    if code == 0 || code == 3 {
        Ok(std::fs::metadata(output).map(|m| m.len()).unwrap_or(0))
    } else {
        let _ = std::fs::remove_file(output);
        Err(anyhow!(String::from_utf8_lossy(&out.stderr).trim().to_string()))
    }
}

/// Lossy-optimise a freshly-built GIF in place with gifsicle. ffmpeg's GIF
/// encoder only does palette work, so it can't shrink an already-optimised GIF
/// (and usually grows it); gifsicle's `--lossy` is what actually compresses.
/// Returns the new size, or `None` if gifsicle is missing/failed (caller then
/// keeps whatever ffmpeg produced).
async fn optimize_gif(app: &AppHandle, quality: &str, path: &str) -> Option<u64> {
    let gifsicle = resolve_tool(app, "gifsicle");
    // Higher lossiness = smaller file, more speckle. With dither=none upstream
    // the result stays clean: balanced lands near 60% of the source at SSIM
    // ~0.96 (vs. ~0.79 for the old bayer+lossy path).
    let lossy = match quality {
        "high" => "30",
        "medium" => "90",
        "low" => "140",
        _ => "50", // balanced
    };
    let lossy_arg = format!("--lossy={lossy}");
    let out = command(&gifsicle)
        .args(["-O3", lossy_arg.as_str(), "--batch", path])
        .output()
        .await
        .ok()?;
    if out.status.success() {
        std::fs::metadata(path).map(|m| m.len()).ok()
    } else {
        None
    }
}

pub(crate) fn copy_mtime(src: &str, dst: &str) {
    if let Ok(meta) = std::fs::metadata(src) {
        if let (Ok(mtime), Ok(f)) = (
            meta.modified(),
            std::fs::File::options().write(true).open(dst),
        ) {
            let times = std::fs::FileTimes::new().set_modified(mtime);
            let _ = f.set_times(times);
        }
    }
}

/// Human-friendly label for the `{resolution}` token (the scale percentage, or
/// the pixel width for a custom resolution).
pub(crate) fn resolution_label(resolution: &str) -> String {
    match resolution {
        "1" => "100%".into(),
        "0.75" => "75%".into(),
        "0.5" => "50%".into(),
        "0.25" => "25%".into(),
        other => other.to_string(),
    }
}

/// Substitute filename-template tokens into a base name (extension excluded).
///
/// `input` is the source path, `out_ext` the chosen output extension (used for
/// `{format}`), `quality` the quality preset label, `resolution` the formatted
/// resolution label. Supported tokens: `{input}` (source stem), `{ext}` (source
/// extension), `{format}` (output extension), `{quality}`, `{resolution}`,
/// `{folder}` (source folder name), `{date}` (local YYYY-MM-DD) and `{time}`
/// (local HH-MM-SS). The legacy `(input)` / `(quality)` forms still resolve.
pub(crate) fn apply_name_template(
    template: &str,
    input: &Path,
    out_ext: &str,
    quality: &str,
    resolution: &str,
) -> String {
    let stem = input.file_stem().and_then(|s| s.to_str()).unwrap_or("output");
    let in_ext = input.extension().and_then(|s| s.to_str()).unwrap_or("");
    let folder = input
        .parent()
        .and_then(Path::file_name)
        .and_then(|s| s.to_str())
        .unwrap_or("");
    // Only read the (timezone-resolving) clock when the template needs it.
    let (date, time) = if template.contains("{date}") || template.contains("{time}") {
        let now = chrono::Local::now();
        (now.format("%Y-%m-%d").to_string(), now.format("%H-%M-%S").to_string())
    } else {
        (String::new(), String::new())
    };
    template
        .replace("{input}", stem)
        .replace("(input)", stem)
        .replace("{ext}", in_ext)
        .replace("{format}", out_ext)
        .replace("{quality}", quality)
        .replace("(quality)", quality)
        .replace("{resolution}", resolution)
        .replace("{folder}", folder)
        .replace("{date}", &date)
        .replace("{time}", &time)
}

/// Output path next to the source (or in `out_dir`), applying the name template
/// and avoiding collisions by appending ` (n)`.
pub(crate) fn output_path(
    input: &str,
    ext: &str,
    out_dir: Option<&str>,
    template: &str,
    quality: &str,
    resolution: &str,
) -> PathBuf {
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
        apply_name_template(template, in_path, ext, quality, resolution)
    };
    base = base.replace(['/', '\\', ':'], "_");
    if base.is_empty() {
        base = stem.to_string();
    }

    let mut candidate = dir.join(format!("{base}.{ext}"));
    let mut n = 1;
    while candidate.exists() {
        candidate = dir.join(format!("{base} ({n}).{ext}"));
        n += 1;
    }
    candidate
}

#[tauri::command]
pub fn cancel_job(app: AppHandle, id: String) {
    app.state::<AppState>().cancel(&id);
}

#[tauri::command]
pub fn cancel_all(app: AppHandle) {
    app.state::<AppState>().cancel_all();
}

/// Generate a small preview thumbnail (data: URL) via ffmpeg. Empty on failure.
#[tauri::command]
pub async fn thumbnail(app: AppHandle, path: String, max_px: Option<u32>) -> Result<String, String> {
    let ffmpeg = resolve_tool(&app, "ffmpeg");
    let max = max_px.unwrap_or(256);
    let ext = ext_of(&path);

    let mut args: Vec<String> = vec!["-hide_banner".into(), "-loglevel".into(), "error".into()];
    if VIDEO_EXTS.contains(&ext.as_str()) {
        args.push("-ss".into());
        args.push("1".into());
    }
    args.extend([
        "-i".into(),
        path.clone(),
        "-vf".into(),
        format!("scale={max}:{max}:force_original_aspect_ratio=decrease"),
        "-frames:v".into(),
        "1".into(),
        "-f".into(),
        "image2".into(),
        "-c:v".into(),
        "mjpeg".into(),
        "-q:v".into(),
        "5".into(),
        "-".into(),
    ]);

    let out = command(&ffmpeg)
        .args(&args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .output()
        .await
        .map_err(|e| e.to_string())?;

    if out.status.success() && !out.stdout.is_empty() {
        let b64 = base64::engine::general_purpose::STANDARD.encode(&out.stdout);
        Ok(format!("data:image/jpeg;base64,{b64}"))
    } else {
        Ok(String::new())
    }
}

/// Whether a path still exists on disk (used to gate the before/after compare
/// when the original may have been removed).
#[tauri::command]
pub async fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

/// Read a file as a `data:` URL of its real bytes (for the before/after
/// comparison — shows the actual image, not a re-encoded thumbnail).
#[tauri::command]
pub async fn read_data_url(path: String) -> Result<String, String> {
    let bytes = tokio::fs::read(&path).await.map_err(|e| e.to_string())?;
    let mime = match ext_of(&path).as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "tiff" | "tif" => "image/tiff",
        "ico" => "image/x-icon",
        "svg" => "image/svg+xml",
        "heic" => "image/heic",
        "heif" => "image/heif",
        _ => "application/octet-stream",
    };
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}

/// Write decoded/rasterised bytes (a HEIC/SVG rasterised to PNG in the webview,
/// or a rebuilt PDF) to the transient cache dir next to the exe so the
/// compressor can read it. The dir is wiped on startup and app exit. Returns
/// the temp path.
#[tauri::command]
pub async fn write_temp(bytes: Vec<u8>, name: String) -> Result<String, String> {
    let dir = crate::tools::cache_root();
    tokio::fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;
    let safe = name.replace(['/', '\\', ':'], "_");
    let path = dir.join(safe);
    tokio::fs::write(&path, bytes).await.map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn set_prevent_sleep(state: State<AppState>, enabled: bool) -> Result<(), String> {
    state.set_prevent_sleep(enabled)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn template_substitutes_static_tokens() {
        let p = Path::new("/srv/Photos/sunset.PNG");
        let out = apply_name_template(
            "{folder}-{input}-{ext}-{format}-{quality}-{resolution}",
            p,
            "webp",
            "balanced",
            "50%",
        );
        assert_eq!(out, "Photos-sunset-PNG-webp-balanced-50%");
    }

    #[test]
    fn template_keeps_legacy_forms() {
        let p = Path::new("/a/b/clip.mov");
        let out = apply_name_template("(input)_(quality)", p, "mp4", "high", "100%");
        assert_eq!(out, "clip_high");
    }

    #[test]
    fn template_fills_date_and_time() {
        let p = Path::new("/a/b/clip.mp4");
        let out = apply_name_template("{input}_{date}_{time}", p, "mp4", "balanced", "100%");
        // Date/time are dynamic; just assert the tokens were replaced and the
        // shape (YYYY-MM-DD / HH-MM-SS = 8+8 digit-and-dash chars) is plausible.
        assert!(out.starts_with("clip_"));
        assert!(!out.contains("{date}") && !out.contains("{time}"));
        assert_eq!(out.matches('-').count(), 4); // 2 in date + 2 in time
    }

    #[test]
    fn resolution_labels() {
        assert_eq!(resolution_label("1"), "100%");
        assert_eq!(resolution_label("0.5"), "50%");
        assert_eq!(resolution_label("0.25"), "25%");
    }
}
