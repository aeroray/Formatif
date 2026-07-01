// Thin wrappers around Tauri commands, events, and plugin calls.
// Safe to import in a plain browser; only *calling* into Tauri needs the
// desktop runtime (guard with `isTauri`).

import { getVersion } from "@tauri-apps/api/app"
import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled,
} from "@tauri-apps/plugin-autostart"
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification"
import type {
  CanceledPayload,
  CompressJob,
  DonePayload,
  ErrorPayload,
  FsEntry,
  ProgressPayload,
  ToolProgressPayload,
  ToolStatus,
  WatchConfig,
  WatchDonePayload,
} from "@/types"

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window

// Mirrors tauri.conf.json / package.json — used only outside the desktop
// runtime (browser preview), where there's no app bundle to ask.
const PREVIEW_VERSION_FALLBACK = "1.0.0"

export function getAppVersion(): Promise<string> {
  return isTauri ? getVersion() : Promise.resolve(PREVIEW_VERSION_FALLBACK)
}

// ---- compression ----

export function compress(jobs: CompressJob[]) {
  return invoke<void>("compress_files", { jobs })
}

export function cancelJob(id: string) {
  return invoke<void>("cancel_job", { id })
}

export function cancelAll() {
  return invoke<void>("cancel_all")
}

/** Expand dropped paths (files + folders) into a flat file list, descending
 *  at most `maxDepth` folder levels (99 ≈ unlimited). */
export function expandPaths(paths: string[], maxDepth = 99) {
  return invoke<FsEntry[]>("expand_paths", { paths, maxDepth })
}

/** A small preview thumbnail (data: URL) for a file, or "" if unavailable. */
export function thumbnail(path: string, maxPx = 256) {
  return invoke<string>("thumbnail", { path, maxPx })
}

/** A file's real bytes as a data: URL (for the before/after comparison). */
export function readDataUrl(path: string) {
  return invoke<string>("read_data_url", { path })
}

/** Whether a path still exists on disk. */
export function pathExists(path: string) {
  return invoke<boolean>("path_exists", { path })
}

/** A webview-loadable URL for a local file (asset protocol) — used to stream a
 *  video into an in-app <video> element without copying it. Outside Tauri the
 *  asset protocol is unavailable, so we fall back to the raw path. */
export function assetSrc(path: string): string {
  return isTauri ? convertFileSrc(path) : path
}

/** Open a file with the OS default application (fallback for codecs the
 *  webview can't play in-app). */
export async function openPath(path: string): Promise<void> {
  try {
    const { openPath } = await import("@tauri-apps/plugin-opener")
    await openPath(path)
  } catch (err) {
    console.error("openPath failed", err)
  }
}

/** Write decoded bytes to a temp file (HEIC/SVG → PNG); returns its path. */
export function writeTemp(bytes: Uint8Array, name: string) {
  return invoke<string>("write_temp", { bytes: Array.from(bytes), name })
}

// ---- tool manager ----

export function toolStatus() {
  return invoke<ToolStatus[]>("tool_status")
}

export function installTool(id: string) {
  return invoke<void>("install_tool", { id })
}

export function reinstallTool(id: string) {
  return invoke<void>("reinstall_tool", { id })
}

/** Ensure the tools required for the given categories are installed. */
export function ensureTools(categories: string[]) {
  return invoke<boolean>("ensure_tools", { categories })
}

export function getLaunchAtLogin() {
  return isAutostartEnabled()
}

export function setLaunchAtLogin(enabled: boolean) {
  return enabled ? enableAutostart() : disableAutostart()
}

export function setPreventSleep(enabled: boolean) {
  return invoke<void>("set_prevent_sleep", { enabled })
}

export async function notify(title: string, body: string): Promise<boolean> {
  let granted = await isPermissionGranted()
  if (!granted) {
    const permission = await requestPermission()
    granted = permission === "granted"
  }
  if (!granted) return false
  sendNotification({ title, body })
  return true
}

export async function canNotify(): Promise<boolean> {
  if (!isTauri) return "Notification" in window
  return isPermissionGranted()
}

export async function requestNotifyPermission(): Promise<boolean> {
  if (!isTauri) {
    if (!("Notification" in window)) return false
    const permission =
      Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission
    return permission === "granted"
  }
  if (await isPermissionGranted()) return true
  return (await requestPermission()) === "granted"
}

// ---- events ----

export function onProgress(cb: (p: ProgressPayload) => void): Promise<UnlistenFn> {
  return listen<ProgressPayload>("compress://progress", (e) => cb(e.payload))
}

export function onDone(cb: (p: DonePayload) => void): Promise<UnlistenFn> {
  return listen<DonePayload>("compress://done", (e) => cb(e.payload))
}

export function onError(cb: (p: ErrorPayload) => void): Promise<UnlistenFn> {
  return listen<ErrorPayload>("compress://error", (e) => cb(e.payload))
}

export function onCanceled(cb: (p: CanceledPayload) => void): Promise<UnlistenFn> {
  return listen<CanceledPayload>("compress://canceled", (e) => cb(e.payload))
}

export function onToolProgress(
  cb: (p: ToolProgressPayload) => void
): Promise<UnlistenFn> {
  return listen<ToolProgressPayload>("tool://progress", (e) => cb(e.payload))
}

export function onWatchCompressed(
  cb: (p: WatchDonePayload) => void
): Promise<UnlistenFn> {
  return listen<WatchDonePayload>("watch://compressed", (e) => cb(e.payload))
}

// ---- plugin helpers (dialog / opener) ----

export async function pickFiles(): Promise<string[]> {
  const { open } = await import("@tauri-apps/plugin-dialog")
  const result = await open({ directory: false, multiple: true })
  if (!result) return []
  return Array.isArray(result) ? result : [result]
}

export async function pickFolder(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog")
  const result = await open({ directory: true, multiple: false })
  return typeof result === "string" ? result : null
}

export async function pickFolders(): Promise<string[]> {
  const { open } = await import("@tauri-apps/plugin-dialog")
  const result = await open({ directory: true, multiple: true })
  if (!result) return []
  return Array.isArray(result) ? result : [result]
}

/** Configure (or stop) the folder watcher for automatic compression. */
export function updateWatcher(config: WatchConfig) {
  return invoke<void>("update_watcher", { config })
}

export async function revealInFolder(path: string): Promise<void> {
  try {
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener")
    await revealItemInDir(path)
  } catch (err) {
    console.error("revealInFolder failed", err)
  }
}

export async function openExternal(url: string): Promise<void> {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener")
    await openUrl(url)
  } catch (err) {
    console.error("openExternal failed", err)
  }
}
