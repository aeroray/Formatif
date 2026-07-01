//! FFmpeg invocation: duration probing and a compression runner that streams
//! progress and supports cancellation. The ffmpeg binary path is resolved by
//! `crate::tools::resolve_tool()` (bundled resource, or PATH in dev).

use std::collections::VecDeque;
use std::process::Stdio;
use std::sync::Arc;

use anyhow::{anyhow, Context, Result};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Notify;

use crate::state::AppState;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub id: String,
    pub percent: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DonePayload {
    pub id: String,
    pub output_path: String,
    pub output_size: u64,
    pub elapsed_ms: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorPayload {
    pub id: String,
    pub message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CanceledPayload {
    pub id: String,
}

/// Build a Command that never pops up a console window on Windows.
pub fn command(program: &str) -> Command {
    let mut std_cmd = std::process::Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        std_cmd.creation_flags(CREATE_NO_WINDOW);
    }
    Command::from(std_cmd)
}

/// Media duration in seconds (None for still images / on failure). Parsed from
/// `ffmpeg -i` stderr so we don't need ffprobe.
pub async fn probe_duration(ffmpeg: &str, input: &str) -> Option<f64> {
    let out = command(ffmpeg)
        .args(["-hide_banner", "-i", input])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .await
        .ok()?;
    let text = String::from_utf8_lossy(&out.stderr);
    let idx = text.find("Duration:")?;
    let ts = text[idx + "Duration:".len()..].split(',').next()?.trim();
    parse_hms(ts)
}

fn parse_hms(ts: &str) -> Option<f64> {
    let mut parts = ts.split(':');
    let h: f64 = parts.next()?.trim().parse().ok()?;
    let m: f64 = parts.next()?.trim().parse().ok()?;
    let sec: f64 = parts.next()?.trim().parse().ok()?;
    let total = h * 3600.0 + m * 60.0 + sec;
    (total > 0.0).then_some(total)
}

enum Outcome {
    Canceled,
    Finished(std::process::ExitStatus),
    Io(anyhow::Error),
}

/// Run FFmpeg once with prebuilt output args. Reports progress through
/// `on_progress`, aborts when `cancel` fires, cleans up partial output on
/// failure, and returns the output size on success.
pub async fn transcode(
    ffmpeg: &str,
    input: &str,
    output: &str,
    out_args: &[String],
    total: f64,
    cancel: Arc<Notify>,
    mut on_progress: impl FnMut(f64),
) -> Result<u64> {
    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-nostdin".into(),
        "-y".into(),
        "-loglevel".into(),
        "error".into(),
        "-i".into(),
        input.to_string(),
    ];
    args.extend(out_args.iter().cloned());
    args.push("-progress".into());
    args.push("pipe:1".into());
    args.push("-nostats".into());
    args.push(output.to_string());

    let mut child = command(ffmpeg)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .with_context(|| format!("could not start ffmpeg ({ffmpeg})"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| anyhow!("failed to capture ffmpeg output"))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| anyhow!("failed to capture ffmpeg output"))?;

    let mut out_lines = BufReader::new(stdout).lines();
    let mut err_lines = BufReader::new(stderr).lines();
    let mut err_tail: VecDeque<String> = VecDeque::new();

    let mut last_emitted = -1.0_f64;
    let outcome = loop {
        tokio::select! {
            _ = cancel.notified() => {
                let _ = child.start_kill();
                let _ = child.wait().await;
                break Outcome::Canceled;
            }
            line = out_lines.next_line() => {
                match line {
                    Ok(Some(l)) => {
                        if total > 0.0 {
                            if let Some(v) = l.strip_prefix("out_time_us=") {
                                if let Ok(us) = v.trim().parse::<f64>() {
                                    let pct = ((us / 1_000_000.0) / total * 100.0).clamp(0.0, 99.0);
                                    if pct - last_emitted >= 1.0 {
                                        last_emitted = pct;
                                        on_progress(pct);
                                    }
                                }
                            }
                        }
                    }
                    Ok(None) => match child.wait().await {
                        Ok(status) => break Outcome::Finished(status),
                        Err(e) => break Outcome::Io(anyhow!(e)),
                    },
                    Err(e) => break Outcome::Io(anyhow!(e)),
                }
            }
            eline = err_lines.next_line() => {
                if let Ok(Some(l)) = eline {
                    err_tail.push_back(l);
                    if err_tail.len() > 40 {
                        err_tail.pop_front();
                    }
                }
            }
        }
    };

    let result = match outcome {
        Outcome::Finished(status) if status.success() => {
            Ok(std::fs::metadata(output).map(|m| m.len()).unwrap_or(0))
        }
        Outcome::Canceled => Err(anyhow!("canceled")),
        Outcome::Finished(_) => {
            let msg = err_tail
                .iter()
                .rev()
                .find(|l| !l.trim().is_empty())
                .map(|l| l.trim().to_string())
                .unwrap_or_else(|| "ffmpeg failed".to_string());
            Err(anyhow!(msg))
        }
        Outcome::Io(e) => Err(e),
    };

    if result.is_err() {
        let _ = std::fs::remove_file(output);
    }
    result
}

/// Tauri-facing compression: probes duration, registers a cancel handle, and
/// emits `compress://progress` while running.
pub async fn compress(
    app: AppHandle,
    id: String,
    ffmpeg: String,
    input: String,
    output: String,
    out_args: Vec<String>,
) -> Result<u64> {
    let total = probe_duration(&ffmpeg, &input).await.unwrap_or(0.0);

    let cancel = Arc::new(Notify::new());
    app.state::<AppState>().register(&id, cancel.clone());

    let progress_id = id.clone();
    let app_for_progress = app.clone();
    let result = transcode(
        &ffmpeg,
        &input,
        &output,
        &out_args,
        total,
        cancel,
        move |pct| {
            let _ = app_for_progress.emit(
                "compress://progress",
                ProgressPayload {
                    id: progress_id.clone(),
                    percent: pct,
                },
            );
        },
    )
    .await;

    app.state::<AppState>().unregister(&id);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    async fn generate(args: &[&str]) {
        let status = command("ffmpeg")
            .args(args)
            .status()
            .await
            .expect("spawn ffmpeg to generate test asset");
        assert!(status.success(), "ffmpeg asset generation failed");
    }

    #[tokio::test]
    async fn transcodes_audio_and_reports_progress() {
        let dir = std::env::temp_dir().join("formatif_test_audio");
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("in.wav");
        let output = dir.join("out.mp3");
        let _ = std::fs::remove_file(&output);
        generate(&[
            "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
            "sine=frequency=440:duration=2", input.to_str().unwrap(),
        ])
        .await;

        let total = probe_duration("ffmpeg", input.to_str().unwrap()).await.unwrap_or(0.0);
        assert!(total > 0.0);

        let ticks = Arc::new(AtomicUsize::new(0));
        let counter = ticks.clone();
        let size = transcode(
            "ffmpeg",
            input.to_str().unwrap(),
            output.to_str().unwrap(),
            &["-c:a".to_string(), "libmp3lame".to_string()],
            total,
            Arc::new(Notify::new()),
            move |_pct| {
                counter.fetch_add(1, Ordering::Relaxed);
            },
        )
        .await
        .expect("audio transcode should succeed");

        assert!(size > 0);
        assert!(output.exists());
        assert!(ticks.load(Ordering::Relaxed) > 0);
    }

    #[tokio::test]
    async fn transcodes_image() {
        let dir = std::env::temp_dir().join("formatif_test_image");
        std::fs::create_dir_all(&dir).unwrap();
        let input = dir.join("in.png");
        let output = dir.join("out.webp");
        let _ = std::fs::remove_file(&output);
        generate(&[
            "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
            "testsrc=size=64x64:rate=1", "-frames:v", "1", input.to_str().unwrap(),
        ])
        .await;

        let size = transcode(
            "ffmpeg",
            input.to_str().unwrap(),
            output.to_str().unwrap(),
            &["-c:v".to_string(), "libwebp".to_string()],
            0.0,
            Arc::new(Notify::new()),
            |_pct| {},
        )
        .await
        .expect("image transcode should succeed");

        assert!(size > 0);
        assert!(output.exists());
    }
}
