// Static compression metadata for the UI controls + file ingest helpers.
// Mirrors the backend's understanding of categories/formats (src-tauri/src/args.rs).

import type {
  Category,
  CompressionSpec,
  FormatId,
  QualityPreset,
  ResolutionScale,
  TypeSettings,
} from "@/types"

export const CATEGORIES: Category[] = ["image", "video", "gif", "pdf"]

export const QUALITY_PRESETS: QualityPreset[] = [
  "original",
  "balanced",
  "high",
  "medium",
  "low",
]

export const RESOLUTIONS: ResolutionScale[] = ["1", "0.75", "0.5", "0.25"]

// Output formats offered per category (first is the default "keep original").
// Only formats that actually compress are offered as image *outputs*. TIFF /
// BMP / TGA / JPEG-2000 are uncompressed or weak codecs that enlarge typical
// images, so they're dropped here (still accepted as inputs — see IMAGE_INPUTS).
export const FORMATS: Record<Category, FormatId[]> = {
  image: ["original", "jpeg", "png", "webp", "avif", "ico"],
  // MPEG (MPEG-2) is an obsolete, inefficient codec that enlarges modern
  // sources (~+50%), so it's not offered as an output (still accepted as input).
  video: [
    "original", "mp4", "webm", "mov", "mkv", "avi", "wmv", "flv", "m4v",
    "3gp", "gif", "mp3", "aac", "wav", "flac", "ogg", "m4a",
  ],
  gif: ["original", "mp4", "webm", "webp"],
  pdf: ["original"],
}

// Type-specific "More settings" chips.
export const OPTION_CHIPS: Record<
  Category,
  { key: "frameRate" | "simplifiedPalette"; kind: "number" | "toggle" }[]
> = {
  image: [],
  video: [],
  // GIF frame-rate + palette are now driven by the quality preset, so no
  // per-type chips are needed.
  gif: [],
  pdf: [],
}

export const DEFAULT_SPEC: CompressionSpec = {
  quality: "balanced",
  resolution: "1",
  format: "original",
}

export function defaultTypeSettings(): TypeSettings {
  return {
    image: { ...DEFAULT_SPEC },
    video: { ...DEFAULT_SPEC },
    gif: { ...DEFAULT_SPEC },
    pdf: { ...DEFAULT_SPEC },
  }
}

// ---- input acceptance / categorization ----

const IMAGE_INPUTS = [
  "jpg", "jpeg", "png", "webp", "bmp", "tiff", "tif", "avif", "ico",
  "tga", "jp2", "j2k", "jpeg2000", "heic", "heif", "svg", "psd",
]
const VIDEO_INPUTS = [
  "mp4", "mov", "mkv", "avi", "webm", "flv", "wmv", "m4v", "mpg", "mpeg",
  "ts", "m2ts", "3gp", "3g2", "ogv",
]
const EXT_TO_CATEGORY: Record<string, Category> = (() => {
  const m: Record<string, Category> = {}
  for (const e of IMAGE_INPUTS) m[e] = "image"
  for (const e of VIDEO_INPUTS) m[e] = "video"
  m["gif"] = "gif"
  m["pdf"] = "pdf"
  return m
})()

export function categoryOf(ext: string): Category | null {
  return EXT_TO_CATEGORY[ext.toLowerCase()] ?? null
}

export function isVideoExt(ext: string): boolean {
  return categoryOf(ext) === "video"
}

// Formats the webview can actually render in <img>/<video> — used to decide
// whether to offer play/compare (no point previewing a TIFF or MKV).
const PREVIEWABLE_IMAGE = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "svg", "avif",
])
const PREVIEWABLE_VIDEO = new Set(["mp4", "m4v", "mov", "webm", "ogv"])

/** Whether the webview can preview this file (image or video) in-app. */
export function canPreview(ext: string): boolean {
  const e = ext.toLowerCase()
  return PREVIEWABLE_IMAGE.has(e) || PREVIEWABLE_VIDEO.has(e)
}

/** Whether the webview can play this as a <video>. */
export function canPreviewVideo(ext: string): boolean {
  return PREVIEWABLE_VIDEO.has(ext.toLowerCase())
}

// ---- path / size helpers ----

export function extOf(name: string): string {
  const i = name.lastIndexOf(".")
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ""
}

export function stemOf(name: string): string {
  const base = name.replace(/[\\/]+$/, "")
  const slash = Math.max(base.lastIndexOf("/"), base.lastIndexOf("\\"))
  const file = slash >= 0 ? base.slice(slash + 1) : base
  const dot = file.lastIndexOf(".")
  return dot > 0 ? file.slice(0, dot) : file
}

export function baseName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "")
  const slash = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"))
  return slash >= 0 ? trimmed.slice(slash + 1) : trimmed
}

export function humanSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`
}

/** The effective spec for a category given a possible per-file override. */
export function effectiveSpec(
  global: CompressionSpec,
  override?: CompressionSpec
): CompressionSpec {
  return override ?? global
}
