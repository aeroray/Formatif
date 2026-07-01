import { useEffect } from "react"
import { toast } from "sonner"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useAppStore, useSettingsStore } from "@/store/store"
import {
  isTauri,
  onCanceled,
  onDone,
  onError,
  onProgress,
  onToolProgress,
  onWatchCompressed,
  notify,
  setPreventSleep,
  thumbnail,
  toolStatus,
  updateWatcher,
} from "@/lib/tauri"
import { pdfPageDataUrl } from "@/lib/pdf"
import { tx } from "@/lib/i18n"
import { baseName, humanSize } from "@/lib/compress"
import type { RunSummary, WatchConfig } from "@/types"
import { TitleBar } from "@/components/TitleBar"
import { MainScreen } from "@/screens/MainScreen"
import { SettingsView } from "@/screens/SettingsView"

// When no jobs remain in flight, compute and publish the run summary.
function maybeFinishRun() {
  const s = useAppStore.getState()
  if (!s.running) return
  if (s.files.some((f) => f.status === "queued" || f.status === "compressing")) return
  const done = s.files.filter((f) => f.status === "done" && f.result)
  const savedBytes = done.reduce(
    (a, f) => a + Math.max(0, f.size - f.result!.outputSize),
    0
  )
  const origTotal = done.reduce((a, f) => a + f.size, 0)
  const summary = {
    count: done.length,
    savedBytes,
    savedPct: origTotal > 0 ? (savedBytes / origTotal) * 100 : 0,
    spentMs: Date.now() - s.runStartMs,
  }
  s.finishRun(summary)
  void notifyRunComplete(summary)
}

async function notifyRunComplete(summary: RunSummary) {
  if (useSettingsStore.getState().prefs.notifications !== "complete") return
  try {
    const pct = `${Math.round(summary.savedPct)}%`
    await notify(
      tx("app.name"),
      tx("main.summary", {
        n: summary.count,
        saved: humanSize(summary.savedBytes),
        pct,
        secs: (summary.spentMs / 1000).toFixed(2),
      })
    )
  } catch {
    // Notification support depends on the host WebView; toasts still show status.
  }
}

function refreshTools() {
  if (!isTauri) return
  toolStatus()
    .then((list) => useAppStore.getState().applyTools(list))
    .catch(() => {})
}

export default function App() {
  const view = useAppStore((s) => s.view)
  const running = useAppStore((s) => s.running)
  const theme = useSettingsStore((s) => s.theme)
  const accent = useSettingsStore((s) => s.accent)
  const preventSleep = useSettingsStore((s) => s.prefs.preventSleep)

  // Apply the theme (light / dark / system) to <html>.
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const dark =
        theme === "dark" ||
        (theme === "system" &&
          window.matchMedia("(prefers-color-scheme: dark)").matches)
      root.classList.toggle("dark", dark)
    }
    apply()
    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)")
      mq.addEventListener("change", apply)
      return () => mq.removeEventListener("change", apply)
    }
  }, [theme])

  // Apply the accent color scheme to <html>.
  useEffect(() => {
    document.documentElement.dataset.accent = accent
  }, [accent])

  // Keep the OS awake only while a compression run is active and the setting is on.
  useEffect(() => {
    if (!isTauri) return
    const enabled = preventSleep && running
    setPreventSleep(enabled).catch(() => {})
    return () => {
      if (enabled) setPreventSleep(false).catch(() => {})
    }
  }, [preventSleep, running])

  // Block the webview's default right-click menu (keep it on text fields).
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest("input, textarea")) return
      e.preventDefault()
    }
    document.addEventListener("contextmenu", onContextMenu)
    return () => document.removeEventListener("contextmenu", onContextMenu)
  }, [])

  // Subscribe to compression + tool events (desktop only).
  useEffect(() => {
    if (!isTauri) return
    refreshTools()

    const subs = Promise.all([
      onProgress((p) =>
        useAppStore.getState().updateFile(p.id, {
          status: "compressing",
          percent: p.percent,
        })
      ),
      onDone((p) => {
        const file = useAppStore.getState().files.find((f) => f.id === p.id)
        const savedPct = file && file.size > 0 ? (1 - p.outputSize / file.size) * 100 : 0
        useAppStore.getState().updateFile(p.id, {
          status: "done",
          percent: 100,
          result: {
            outputPath: p.outputPath,
            outputSize: p.outputSize,
            savedPct,
            elapsedMs: p.elapsedMs,
          },
        })
        // Swap the cover to a preview of the processed output.
        if (file) {
          const gen =
            file.category === "pdf"
              ? pdfPageDataUrl(p.outputPath)
              : thumbnail(p.outputPath)
          gen
            .then((url) => url && useAppStore.getState().setThumbnail(p.id, url))
            .catch(() => {})
        }
        maybeFinishRun()
      }),
      onError((p) => {
        const file = useAppStore.getState().files.find((f) => f.id === p.id)
        useAppStore.getState().updateFile(p.id, { status: "error", error: p.message })
        toast.error(tx("toast.compressFail", { name: file ? baseName(file.name) : "" }))
        maybeFinishRun()
      }),
      onCanceled((p) => {
        useAppStore.getState().updateFile(p.id, { status: "canceled" })
        maybeFinishRun()
      }),
      onToolProgress((p) => {
        useAppStore.getState().updateTool(p.id, {
          state: p.state,
          percent: p.total > 0 ? Math.round((p.received / p.total) * 100) : 0,
        })
        if (p.state === "installed" || p.state === "error") refreshTools()
      }),
      onWatchCompressed((p) => {
        const pct =
          p.originalSize > 0
            ? Math.max(0, Math.round((1 - p.outputSize / p.originalSize) * 100))
            : 0
        toast.success(tx("toast.watchCompressed", { name: baseName(p.input), pct }))
      }),
    ])

    return () => {
      subs.then((unsubs) => unsubs.forEach((u) => u()))
    }
  }, [])

  // Keep the Rust folder watcher in sync with watch-related settings.
  useEffect(() => {
    if (!isTauri) return
    let last = ""
    const sync = () => {
      const s = useSettingsStore.getState()
      // The watcher compresses with its own selected preset (default: the
      // read-only default preset), independent of the workspace's active one.
      const wp =
        s.presets.find((p) => p.id === s.watchPresetId) ??
        s.presets.find((p) => p.builtin) ??
        s.presets[0]
      const config: WatchConfig = {
        // No manual toggle anymore — watch whenever folders are configured.
        enabled: s.watchFolders.length > 0,
        folders: s.watchFolders,
        maxDepth: s.folderDepth,
        types: s.folderTypes,
        specs: wp.typeSettings,
        output: {
          dir: wp.output.folder,
          nameTemplate: wp.output.nameTemplate,
          removeOriginal: wp.output.removeOriginal,
          fsMetadata: wp.output.fsMetadata,
        },
      }
      const key = JSON.stringify(config)
      if (key === last) return
      last = key
      updateWatcher(config).catch(() => {})
    }
    sync()
    return useSettingsStore.subscribe(sync)
  }, [])

  return (
    <TooltipProvider delayDuration={300}>
      {/* Transparent so the body's accent wash shows through; the frosted-glass
          look comes from backdrop-blur on the panels below. */}
      <div className="flex h-full flex-col">
        <TitleBar />
        <div className="min-h-0 flex-1">
          {view === "settings" ? <SettingsView /> : <MainScreen />}
        </div>
      </div>
      <Toaster />
    </TooltipProvider>
  )
}
