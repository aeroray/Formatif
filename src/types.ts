// Shared types for Formatif (compression-first). The Rust backend mirrors the
// data contract (see src-tauri/src/args.rs, compress.rs, tools.rs).

export type Lang = "en" | "zh"

export type Theme = "light" | "dark" | "system"

// Accent color schemes (hue only — works in both light and dark mode).
export type Accent =
  | "violet"
  | "indigo"
  | "azure"
  | "emerald"
  | "amber"
  | "rose"
  | "graphite"

// The four card/setting categories. GIF is split out from image because it has
// its own settings card and conversion targets.
export type Category = "image" | "video" | "gif" | "pdf"

export type AppView = "app" | "settings"
export type SettingsSection =
  | "general"
  | "media"
  | "monitor"
  | "appearance"
  | "extensions"
  | "about"

export type QualityPreset = "original" | "balanced" | "high" | "medium" | "low"
export type ResolutionScale = "1" | "0.75" | "0.5" | "0.25"
export type FormatId = string // "original" | "jpeg" | "png" | "webp" | "avif" | "mp4" | ...

// One file's compression settings. Type-specific options are optional fields.
export interface CompressionSpec {
  quality: QualityPreset
  resolution: ResolutionScale
  format: FormatId
  frameRate?: number | null // GIF
  simplifiedPalette?: boolean // GIF
}

export type FileStatus =
  | "ready"
  | "queued"
  | "compressing"
  | "done"
  | "error"
  | "canceled"

export interface CompressResult {
  outputPath: string
  outputSize: number
  savedPct: number // 0..100 (positive = smaller)
  elapsedMs?: number
}

export interface FileItem {
  id: string
  path: string
  name: string
  stem: string
  ext: string
  category: Category
  size: number // bytes
  isVideo: boolean // play badge
  thumbnail?: string // data: URL from the `thumbnail` command
  thumbPending?: boolean // a thumbnail is still being generated (show a loader)
  override?: CompressionSpec // per-file override (undefined = inherit global)
  status: FileStatus
  percent: number
  result?: CompressResult
  error?: string
}

export type TypeSettings = Record<Category, CompressionSpec>

// A named bundle of output + per-category compression settings. The built-in
// "Default preset" (builtin: true) is read-only (edited only in Settings),
// hidden from the sidebar, and is the template/fallback for the others.
export interface Preset {
  id: string
  name: string
  builtin?: boolean
  output: OutputConfig
  typeSettings: TypeSettings
}

export interface OutputConfig {
  folder: string | null // null = "Same as input"
  nameTemplate: string // e.g. "{input}_compressed" — {input}/{quality} tokens
  removeOriginal: boolean
  fsMetadata: boolean
}

export interface RunSummary {
  count: number
  savedBytes: number
  savedPct: number
  spentMs: number
}

// ---- Tool manager ----

export type ToolState = "installed" | "missing" | "installing" | "error"

export interface ToolStatus {
  id: string
  name: string
  state: ToolState
  sizeBytes?: number
  version?: string
  percent?: number
  optional?: boolean
  error?: string
  url?: string // download source
  installPath?: string // where it's installed (when present)
}

// ---- Backend (Rust) command / event contract ----

export interface CompressJob {
  id: string
  input: string
  originalInput?: string // original path for output naming when `input` is a decoded temp
  category: Category
  spec: CompressionSpec
  outputDir: string | null
  nameTemplate: string
  removeOriginal: boolean
  fsMetadata: boolean
}

export interface FsEntry {
  path: string
  name: string
  size: number
  fromFolder: boolean // true when discovered by expanding a dropped folder
}

export interface ProgressPayload {
  id: string
  percent: number
}

export interface DonePayload {
  id: string
  outputPath: string
  outputSize: number
  elapsedMs?: number
}

export interface ErrorPayload {
  id: string
  message: string
}

export interface CanceledPayload {
  id: string
}

export interface ToolProgressPayload {
  id: string
  received: number
  total: number
  state: ToolState
}

export interface WatchDonePayload {
  input: string
  output: string
  originalSize: number
  outputSize: number
}

// Sent to the Rust `update_watcher` command.
export interface WatchConfig {
  enabled: boolean
  folders: string[]
  maxDepth: number
  types: Record<Category, boolean>
  specs: TypeSettings
  output: {
    dir: string | null
    nameTemplate: string
    removeOriginal: boolean
    fsMetadata: boolean
  }
}
