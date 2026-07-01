import { useCallback } from "react"
import { toast } from "sonner"
import type { CompressJob } from "@/types"
import { useAppStore, useSettingsStore } from "@/store/store"
import { compress, ensureTools, isTauri, writeTemp } from "@/lib/tauri"
import { tx } from "@/lib/i18n"
import { decodeToPng, needsDecode } from "@/lib/decode"
import { compressPdf } from "@/lib/pdf"

const PENDING = new Set(["ready", "error", "canceled"])

/** Build CompressJobs from the queue + effective specs and start a run. */
export function useRunCompression() {
  return useCallback(async () => {
    if (!isTauri) {
      toast.info(tx("toast.desktopOnly"))
      return
    }
    const app = useAppStore.getState()
    const settings = useSettingsStore.getState()
    const targets = app.files.filter((f) => PENDING.has(f.status))
    if (targets.length === 0) return

    // Show the loading state immediately (covers tool download time too).
    app.startRun()

    // Make sure the tools for these categories are present (downloads once).
    const categories = [...new Set(targets.map((f) => f.category))]
    let ready = false
    try {
      ready = await ensureTools(categories)
    } catch {
      ready = false
    }
    if (!ready) {
      app.finishRun({ count: 0, savedBytes: 0, savedPct: 0, spentMs: 0 })
      toast.error(tx("toast.toolMissing", { name: "ffmpeg" }))
      return
    }

    // Reset the timer after any download so "spent" reflects compression only.
    app.startRun()
    targets.forEach((f) =>
      app.updateFile(f.id, {
        status: "queued",
        percent: 0,
        result: undefined,
        error: undefined,
      })
    )

    // Build jobs, decoding HEIC/HEIF/SVG → PNG (temp) where needed.
    const out = settings.output
    const jobs: CompressJob[] = []
    for (const f of targets) {
      const base = f.override ?? settings.typeSettings[f.category]
      let input = f.path
      let originalInput: string | undefined
      let spec = base
      if (needsDecode(f.ext)) {
        try {
          const png = await decodeToPng(f.path, f.ext)
          input = await writeTemp(png, `${f.id}.png`)
          originalInput = f.path
          // can't re-emit the source container (svg/heic) → sensible default
          if (base.format === "original") {
            spec = { ...base, format: f.ext.toLowerCase() === "svg" ? "png" : "jpeg" }
          }
        } catch {
          app.updateFile(f.id, { status: "error", error: "decode failed" })
          continue
        }
      } else if (f.category === "pdf" && base.quality !== "original") {
        // qpdf can't downsample images; rasterise+downsample via pdf.js, but
        // only keep it when it actually beats the original (text PDFs grow).
        try {
          const pdfBytes = await compressPdf(f.path, base.quality)
          if (pdfBytes.length < f.size) {
            input = await writeTemp(pdfBytes, `${f.id}.pdf`)
            originalInput = f.path
          }
        } catch {
          // fall back to qpdf-only on the original
        }
      }
      jobs.push({
        id: f.id,
        input,
        originalInput,
        category: f.category,
        spec,
        outputDir: out.folder,
        nameTemplate: out.nameTemplate,
        removeOriginal: out.removeOriginal,
        fsMetadata: out.fsMetadata,
      })
    }

    if (jobs.length === 0) {
      app.finishRun({ count: 0, savedBytes: 0, savedPct: 0, spentMs: 0 })
      return
    }

    try {
      await compress(jobs)
    } catch {
      jobs.forEach((j) => app.updateFile(j.id, { status: "error" }))
      app.finishRun({ count: 0, savedBytes: 0, savedPct: 0, spentMs: 0 })
    }
  }, [])
}
