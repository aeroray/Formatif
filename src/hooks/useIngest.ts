import { useCallback } from "react"
import { toast } from "sonner"
import type { FileItem } from "@/types"
import { useAppStore, useSettingsStore } from "@/store/store"
import { categoryOf, extOf, isVideoExt, stemOf } from "@/lib/compress"
import { expandPaths, isTauri, thumbnail } from "@/lib/tauri"
import { pdfPageDataUrl } from "@/lib/pdf"
import { tx } from "@/lib/i18n"

/** Expand dropped/picked paths into queue items + kick off thumbnail probing. */
export function useIngest() {
  return useCallback(async (paths: string[]) => {
    if (!isTauri) {
      toast.info(tx("toast.desktopOnly"))
      return
    }
    try {
      const settings = useSettingsStore.getState()
      const entries = await expandPaths(paths, settings.folderDepth)
      const items: FileItem[] = []
      let unsupported = 0
      for (const e of entries) {
        const ext = extOf(e.name)
        const category = categoryOf(ext)
        if (!category) {
          unsupported++
          continue
        }
        // Files discovered inside dropped folders respect the type filter.
        if (e.fromFolder && !settings.folderTypes[category]) continue
        items.push({
          id: crypto.randomUUID(),
          path: e.path,
          name: e.name,
          stem: stemOf(e.name),
          ext,
          category,
          size: e.size,
          isVideo: isVideoExt(ext),
          status: "ready",
          percent: 0,
          thumbPending: true,
        })
      }

      // Nothing compressible at all (e.g. a folder with only unsupported files,
      // an empty folder, or everything filtered out by the type filter).
      if (items.length === 0) {
        toast.warning(tx("toast.noFiles"))
        return
      }

      const { added, reset, duplicate } = useAppStore.getState().addFiles(items)
      // Only complain when nothing new was added and nothing was reset.
      if (duplicate > 0 && added === 0 && reset === 0) {
        toast.info(tx("toast.alreadyAdded"))
      }
      if (unsupported > 0) {
        toast.message(
          tx(unsupported === 1 ? "toast.skipped1" : "toast.skipped", { n: unsupported })
        )
      }

      // Thumbnails: probe only queued files that still lack one (skip resets/dupes).
      // PDFs are rendered via pdf.js; everything else via ffmpeg (Rust).
      const dropped = new Set(items.map((it) => it.path))
      const thumbs = useAppStore
        .getState()
        .files.filter((f) => dropped.has(f.path) && !f.thumbnail)
      void (async () => {
        for (let i = 0; i < thumbs.length; i += 4) {
          await Promise.all(
            thumbs.slice(i, i + 4).map((f) =>
              (f.category === "pdf" ? pdfPageDataUrl(f.path) : thumbnail(f.path))
                .then((url) => {
                  if (url) useAppStore.getState().setThumbnail(f.id, url)
                })
                .catch(() => {})
                .finally(() =>
                  useAppStore.getState().updateFile(f.id, { thumbPending: false })
                )
            )
          )
        }
      })()
    } catch {
      toast.error(tx("toast.readError"))
    }
  }, [])
}
