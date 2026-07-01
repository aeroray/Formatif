//! Builds ffmpeg output arguments from a `CompressionSpec`. Maps each quality
//! preset to concrete encoder settings per (category × format).

use serde::Deserialize;

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CompressionSpec {
    pub quality: String,    // original | balanced | high | medium | low
    pub resolution: String, // "1" | "0.75" | "0.5" | "0.25"
    pub format: String,
    #[serde(default)]
    pub frame_rate: Option<u32>,
    // Retired UI option (GIF palette is now quality-driven); kept for wire compat.
    #[serde(default)]
    #[allow(dead_code)]
    pub simplified_palette: Option<bool>,
}

/// Pick a value by quality preset. Order: original, balanced, high, medium, low.
fn pick<'a>(
    q: &str,
    original: &'a str,
    balanced: &'a str,
    high: &'a str,
    medium: &'a str,
    low: &'a str,
) -> &'a str {
    match q {
        "original" => original,
        "high" => high,
        "medium" => medium,
        "low" => low,
        _ => balanced,
    }
}

fn s(v: &str) -> String {
    v.to_string()
}

fn scale_filter(spec: &CompressionSpec) -> Option<String> {
    match spec.resolution.as_str() {
        "0.75" => Some("scale=trunc(iw*0.75/2)*2:trunc(ih*0.75/2)*2".into()),
        "0.5" => Some("scale=trunc(iw*0.5/2)*2:trunc(ih*0.5/2)*2".into()),
        "0.25" => Some("scale=trunc(iw*0.25/2)*2:trunc(ih*0.25/2)*2".into()),
        _ => None,
    }
}

fn norm_img(ext: &str) -> String {
    match ext.to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => "jpeg".into(),
        "png" => "png".into(),
        "webp" => "webp".into(),
        "avif" => "avif".into(),
        "tiff" | "tif" => "tiff".into(),
        "bmp" => "bmp".into(),
        "ico" => "ico".into(),
        "tga" => "tga".into(),
        "jp2" | "j2k" | "jpeg2000" => "jp2".into(),
        other => other.into(),
    }
}

/// Output file extension for the chosen spec.
pub fn output_ext(category: &str, spec: &CompressionSpec, input_ext: &str) -> String {
    if category == "pdf" {
        return "pdf".into();
    }
    match spec.format.as_str() {
        "jpeg" => "jpg".into(),
        "png" => "png".into(),
        "webp" => "webp".into(),
        "avif" => "avif".into(),
        "tiff" => "tiff".into(),
        "bmp" => "bmp".into(),
        "ico" => "ico".into(),
        "jp2" => "jp2".into(),
        "tga" => "tga".into(),
        "mp4" => "mp4".into(),
        "webm" => "webm".into(),
        "mov" => "mov".into(),
        "mkv" => "mkv".into(),
        "avi" => "avi".into(),
        "wmv" => "wmv".into(),
        "flv" => "flv".into(),
        "m4v" => "m4v".into(),
        "mpeg" | "mpg" => "mpg".into(),
        "3gp" => "3gp".into(),
        "gif" => "gif".into(),
        "mp3" => "mp3".into(),
        "aac" => "aac".into(),
        "m4a" => "m4a".into(),
        "wav" => "wav".into(),
        "flac" => "flac".into(),
        "ogg" => "ogg".into(),
        _ => {
            if category == "gif" {
                "gif".into()
            } else {
                input_ext.to_ascii_lowercase()
            }
        }
    }
}

/// ffmpeg output args (placed after `-i <input>`, before `<output>`).
///
/// `src_kbps` is the source's overall bitrate (kbit/s) when known; it lets the
/// video encoders cap the output below the source so an already-compressed
/// clip reliably shrinks instead of growing.
pub fn build_args(
    category: &str,
    spec: &CompressionSpec,
    input_ext: &str,
    src_kbps: Option<u64>,
) -> Vec<String> {
    let scale = scale_filter(spec);
    match category {
        "image" => image_args(spec, input_ext, &scale),
        "video" | "gif" => media_args(category, spec, &scale, src_kbps),
        _ => vec![],
    }
}

/// Cap (kbit/s) for the video bitrate: a fraction of the source so the output
/// is reliably smaller. None when the source bitrate is unknown or quality is
/// "original" (no cap → best quality).
fn bitrate_cap(q: &str, src_kbps: Option<u64>) -> Option<u64> {
    if q == "original" {
        return None;
    }
    let frac = match q {
        "high" => 0.72,
        "medium" => 0.45,
        "low" => 0.30,
        _ => 0.58, // balanced
    };
    src_kbps.map(|k| (((k as f64) * frac) as u64).max(120))
}

// ------------------------------- images -------------------------------

fn image_args(spec: &CompressionSpec, input_ext: &str, scale: &Option<String>) -> Vec<String> {
    let q = spec.quality.as_str();
    let fmt = if spec.format == "original" {
        norm_img(input_ext)
    } else {
        spec.format.clone()
    };

    // PNG: lossless re-encode barely shrinks; non-Original quality quantizes.
    let png_lossy = fmt == "png" && q != "original";
    let vf: Option<String> = if png_lossy {
        let colors = match q {
            "high" => 256,
            "medium" => 64,
            "low" => 32,
            _ => 128,
        };
        let prefix = scale.as_ref().map(|sf| format!("{sf},")).unwrap_or_default();
        Some(format!(
            "{prefix}split[s0][s1];[s0]palettegen=max_colors={colors}[p];[s1][p]paletteuse=dither=sierra2_4a"
        ))
    } else if fmt == "ico" {
        // ICO must be <= 256px.
        Some("scale='min(256,iw)':'min(256,ih)':force_original_aspect_ratio=decrease".into())
    } else {
        scale.clone()
    };

    let mut v: Vec<String> = Vec::new();
    if let Some(f) = vf {
        v.push(s("-vf"));
        v.push(f);
    }
    match fmt.as_str() {
        "jpeg" | "jpg" => {
            v.push(s("-q:v"));
            v.push(s(pick(q, "2", "6", "4", "11", "18")));
        }
        "png" => {
            v.extend([s("-c:v"), s("png"), s("-compression_level"), s("9")]);
        }
        "webp" => {
            v.extend([
                s("-c:v"),
                s("libwebp"),
                s("-quality"),
                s(pick(q, "98", "82", "92", "66", "50")),
                s("-compression_level"),
                s("6"),
            ]);
        }
        "avif" => {
            v.extend([
                s("-c:v"),
                s("libaom-av1"),
                s("-still-picture"),
                s("1"),
                s("-crf"),
                s(pick(q, "18", "32", "24", "42", "52")),
                s("-b:v"),
                s("0"),
                s("-cpu-used"),
                s("6"),
                s("-pix_fmt"),
                s("yuv420p"),
            ]);
        }
        "tiff" => {
            v.extend([s("-compression_algo"), s("deflate")]);
        }
        // bmp / ico / tga / jp2: the output extension selects the encoder.
        _ => {}
    }
    v
}

// ------------------------------- video / gif -------------------------------

fn media_args(
    category: &str,
    spec: &CompressionSpec,
    scale: &Option<String>,
    src_kbps: Option<u64>,
) -> Vec<String> {
    let q = spec.quality.as_str();
    let fmt = if spec.format == "original" {
        if category == "gif" {
            "gif"
        } else {
            "__keep"
        }
    } else {
        spec.format.as_str()
    };
    match fmt {
        "gif" => gif_args(spec, scale),
        "webm" => vp9_args(spec, scale, src_kbps),
        "webp" => {
            let mut v = vf(scale);
            v.extend([
                s("-c:v"),
                s("libwebp"),
                s("-loop"),
                s("0"),
                s("-quality"),
                s(pick(q, "90", "78", "85", "68", "55")),
                s("-an"),
            ]);
            v
        }
        "png" => {
            // single frame of a gif → png
            let mut v = vf(scale);
            v.extend([s("-frames:v"), s("1"), s("-c:v"), s("png")]);
            v
        }
        "mp3" => vec![s("-vn"), s("-c:a"), s("libmp3lame"), s("-q:a"), s(pick(q, "0", "4", "2", "6", "8"))],
        "aac" | "m4a" => vec![s("-vn"), s("-c:a"), s("aac"), s("-b:a"), s(pick(q, "256k", "128k", "192k", "96k", "64k"))],
        "wav" => vec![s("-vn"), s("-c:a"), s("pcm_s16le")],
        "flac" => vec![s("-vn"), s("-c:a"), s("flac")],
        "ogg" => vec![s("-vn"), s("-c:a"), s("libvorbis"), s("-q:a"), s(pick(q, "8", "5", "7", "3", "1"))],
        "wmv" => {
            let mut v = vf(scale);
            v.extend([
                s("-c:v"), s("wmv2"), s("-b:v"), s(pick(q, "4M", "2M", "3M", "1.2M", "800k")),
                s("-c:a"), s("wmav2"), s("-b:a"), s(pick(q, "256k", "128k", "192k", "96k", "64k")),
            ]);
            v
        }
        "mpeg" | "mpg" => {
            let mut v = vf(scale);
            v.extend([
                s("-c:v"), s("mpeg2video"), s("-qscale:v"), s(pick(q, "2", "4", "3", "6", "9")),
                s("-c:a"), s("mp2"), s("-b:a"), s("192k"),
            ]);
            v
        }
        "3gp" => {
            let mut v = vf(scale);
            v.extend([
                s("-c:v"), s("libx264"), s("-profile:v"), s("baseline"), s("-level"), s("3.0"),
                s("-crf"), s(pick(q, "20", "26", "23", "30", "34")), s("-pix_fmt"), s("yuv420p"),
                s("-c:a"), s("aac"), s("-b:a"), s(pick(q, "96k", "64k", "96k", "48k", "32k")),
                s("-ar"), s("44100"), s("-ac"), s("2"),
            ]);
            v
        }
        // mp4 / mov / m4v / mkv / avi / __keep → H.264 + AAC
        "mkv" | "avi" => h264(spec, scale, false, src_kbps),
        _ => h264(spec, scale, true, src_kbps),
    }
}

fn vf(scale: &Option<String>) -> Vec<String> {
    match scale {
        Some(sf) => vec![s("-vf"), sf.clone()],
        None => vec![],
    }
}

fn h264(
    spec: &CompressionSpec,
    scale: &Option<String>,
    faststart: bool,
    src_kbps: Option<u64>,
) -> Vec<String> {
    let q = spec.quality.as_str();
    let mut v = vf(scale);
    // CRF drives the size/quality tradeoff. "Balanced" targets CRF 28 — the
    // sweet spot most compressors use: visually sharp but much smaller (CRF ~23
    // looks identical but barely compresses). Higher CRF also encodes faster.
    // The preset improves quality-per-bit; the bitrate cap (below) only
    // guarantees an already-compressed clip never grows.
    v.extend([
        s("-c:v"),
        s("libx264"),
        s("-crf"),
        s(pick(q, "20", "28", "24", "30", "34")),
        s("-preset"),
        s(pick(q, "slow", "fast", "medium", "faster", "veryfast")),
        s("-pix_fmt"),
        s("yuv420p"),
    ]);
    if let Some(cap) = bitrate_cap(q, src_kbps) {
        v.extend([
            s("-maxrate"),
            format!("{cap}k"),
            s("-bufsize"),
            format!("{}k", cap * 2),
        ]);
    }
    v.extend([
        s("-c:a"),
        s("aac"),
        s("-b:a"),
        s(pick(q, "256k", "128k", "160k", "96k", "64k")),
    ]);
    if faststart {
        v.push(s("-movflags"));
        v.push(s("+faststart"));
    }
    v
}

fn vp9_args(spec: &CompressionSpec, scale: &Option<String>, src_kbps: Option<u64>) -> Vec<String> {
    let q = spec.quality.as_str();
    let mut v = vf(scale);
    // libvpx-vp9 fails to open the encoder when "-b:v 0" is combined with
    // "-maxrate", so cap the size via "-b:v <cap>" (constrained-quality mode)
    // instead; with no cap, "-b:v 0" gives constant-quality. CRF drives quality.
    let bv = match bitrate_cap(q, src_kbps) {
        Some(cap) => format!("{cap}k"),
        None => "0".into(),
    };
    v.extend([
        s("-c:v"), s("libvpx-vp9"), s("-crf"), s(pick(q, "20", "33", "28", "40", "48")),
        s("-b:v"), bv,
        // VP9 can't encode paletted/RGB input (e.g. GIF) — force yuv420p, else
        // "Error while opening encoder".
        s("-pix_fmt"), s("yuv420p"),
        s("-row-mt"), s("1"), s("-deadline"), s("good"), s("-cpu-used"), s("4"),
    ]);
    v.extend([
        s("-c:a"), s("libopus"), s("-b:a"), s(pick(q, "128k", "96k", "112k", "80k", "64k")),
    ]);
    v
}

fn gif_args(spec: &CompressionSpec, scale: &Option<String>) -> Vec<String> {
    let q = spec.quality.as_str();
    // Frame rate is the cleanest size lever for a GIF — dropping frames costs
    // motion smoothness, not per-frame fidelity, and `palettegen`+`none` dither
    // barely shrink an already-tight GIF on their own. gifsicle's -O3 dedups
    // any frames duplicated when the cap exceeds the source rate, so a fixed
    // cap is safe. Balanced steps down to ~10fps to reach a real size cut.
    let fps = spec.frame_rate.unwrap_or_else(|| match q {
        "original" => 25,
        "high" => 20,
        "medium" => 8,
        "low" => 6,
        _ => 10, // balanced
    });
    // More colours = less banding, bigger file. Balanced keeps a generous 128.
    let colors = match q {
        "original" | "high" => 256,
        "medium" => 96,
        "low" => 64,
        _ => 128, // balanced
    };
    let mut graph = format!("fps={fps}");
    if let Some(sf) = scale {
        graph.push(',');
        graph.push_str(sf);
    } else {
        graph.push_str(",scale=trunc(iw/2)*2:-2");
    }
    // dither=none: ordered (bayer) dithering paints a visible crosshatch
    // speckle over the whole frame — that's the "noise" — and wrecks fidelity
    // (SSIM ~0.79 vs ~0.96). With a per-clip palette, flat regions stay clean;
    // gifsicle's --lossy does the actual shrinking afterwards.
    let filter = format!(
        "{graph},split[s0][s1];[s0]palettegen=max_colors={colors}[p];[s1][p]paletteuse=dither=none"
    );
    vec![s("-filter_complex"), filter, s("-loop"), s("0"), s("-an")]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec(format: &str, quality: &str, resolution: &str) -> CompressionSpec {
        CompressionSpec {
            quality: quality.into(),
            resolution: resolution.into(),
            format: format.into(),
            frame_rate: None,
            simplified_palette: None,
        }
    }

    #[test]
    fn image_webp_balanced() {
        let a = build_args("image", &spec("webp", "balanced", "1"), "png", None);
        assert!(a.contains(&"libwebp".to_string()));
        assert!(a.contains(&"82".to_string()));
        assert!(!a.contains(&"-vf".to_string()));
    }

    #[test]
    fn png_balanced_quantizes() {
        let a = build_args("image", &spec("png", "balanced", "1"), "png", None);
        assert!(a.iter().any(|x| x.contains("palettegen")));
    }

    #[test]
    fn png_original_lossless() {
        let a = build_args("image", &spec("png", "original", "1"), "png", None);
        assert!(!a.iter().any(|x| x.contains("palettegen")));
    }

    #[test]
    fn video_mp4_uses_x264() {
        let a = build_args("video", &spec("mp4", "medium", "1"), "mov", None);
        assert!(a.contains(&"libx264".to_string()));
        assert!(a.contains(&"30".to_string()));
        assert_eq!(output_ext("video", &spec("mp4", "medium", "1"), "mov"), "mp4");
    }

    #[test]
    fn video_balanced_caps_bitrate() {
        // With a known source bitrate, balanced caps maxrate below the source.
        let a = build_args("video", &spec("mp4", "balanced", "1"), "mp4", Some(10_000));
        assert!(a.contains(&"-maxrate".to_string()));
        assert!(a.contains(&"5800k".to_string())); // 10000 * 0.58
        // No cap when the source bitrate is unknown.
        let b = build_args("video", &spec("mp4", "balanced", "1"), "mp4", None);
        assert!(!b.contains(&"-maxrate".to_string()));
    }

    #[test]
    fn video_to_audio_only() {
        let a = build_args("video", &spec("flac", "high", "1"), "mp4", None);
        assert!(a.contains(&"-vn".to_string()));
        assert!(a.contains(&"flac".to_string()));
    }

    #[test]
    fn webm_vp9_caps_via_bv_not_maxrate() {
        // VP9 must cap via -b:v (constrained quality); -b:v 0 + -maxrate fails to
        // open the encoder, so -maxrate must never be emitted for vp9.
        let a = build_args("video", &spec("webm", "balanced", "1"), "mp4", Some(2000));
        assert!(a.contains(&"libvpx-vp9".to_string()));
        assert!(!a.contains(&"-maxrate".to_string()));
        let bv = a.iter().position(|x| x == "-b:v").map(|i| a[i + 1].as_str());
        assert_eq!(bv, Some("1160k")); // 2000 * 0.58
        // No cap (original quality) → constant-quality -b:v 0.
        let b = build_args("video", &spec("webm", "original", "1"), "mp4", Some(2000));
        let bv0 = b.iter().position(|x| x == "-b:v").map(|i| b[i + 1].as_str());
        assert_eq!(bv0, Some("0"));
    }

    #[test]
    fn mov_keeps_container() {
        assert_eq!(output_ext("video", &spec("mov", "balanced", "1"), "mp4"), "mov");
        let a = build_args("video", &spec("mov", "balanced", "1"), "mp4", None);
        assert!(a.contains(&"libx264".to_string()));
    }

    #[test]
    fn gif_output_builds_palette() {
        // Balanced: dither=none (not bayer) is the noise fix; fps caps low for
        // a real size cut; a generous 128-colour palette keeps banding down.
        let a = build_args("gif", &spec("original", "balanced", "1"), "gif", None);
        let filter = a.iter().find(|x| x.contains("palettegen")).expect("palette filter");
        assert!(filter.contains("max_colors=128"));
        assert!(filter.contains("dither=none"));
        assert!(!filter.contains("bayer"));
        assert!(filter.contains("fps=10"));
        // Low trades the palette down further (but not so far it bands hard).
        let low = build_args("gif", &spec("original", "low", "1"), "gif", None);
        assert!(low.iter().any(|x| x.contains("palettegen=max_colors=64")));
    }

    #[test]
    fn webm_vp9_sets_pix_fmt() {
        // Required so paletted/RGB sources (GIF) don't fail to open the encoder.
        let a = build_args("gif", &spec("webm", "balanced", "1"), "gif", None);
        assert!(a.contains(&"libvpx-vp9".to_string()));
        assert!(a.windows(2).any(|w| w[0] == "-pix_fmt" && w[1] == "yuv420p"));
    }

    #[test]
    fn image_tiff_deflate() {
        let a = build_args("image", &spec("tiff", "balanced", "1"), "png", None);
        assert!(a.contains(&"deflate".to_string()));
        assert_eq!(output_ext("image", &spec("tiff", "balanced", "1"), "png"), "tiff");
    }
}
