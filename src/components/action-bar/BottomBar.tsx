import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAppStore, useSettingsStore } from "@/store/store"
import { humanSize } from "@/lib/compress"
import { useT } from "@/lib/i18n"

const PENDING = new Set(["ready", "error", "canceled"])
const RUN = new Set(["queued", "compressing", "done", "error", "canceled"])

/** Global footer: run info on the left, Clear/Compress on the right, and an
 *  overall progress bar along the top edge while a run is in flight. */
export function BottomBar({ onCompress }: { onCompress: () => void }) {
  const files = useAppStore((s) => s.files)
  const running = useAppStore((s) => s.running)
  const runSummary = useAppStore((s) => s.runSummary)
  const clearAll = useAppStore((s) => s.clearAll)
  const nameEmpty = useSettingsStore((s) => s.output.nameTemplate.trim().length === 0)
  const t = useT()

  const pending = files.filter((f) => PENDING.has(f.status)).length

  // Aggregate progress across the files in the current run: completed files
  // count as 100, the in-flight ones contribute their real (time-based) percent,
  // queued ones 0 — so the bar fills monotonically and tracks actual work.
  const runFiles = files.filter((f) => RUN.has(f.status))
  const overall =
    running && runFiles.length
      ? Math.max(
          0,
          Math.min(
            100,
            runFiles.reduce((a, f) => {
              if (f.status === "compressing") return a + f.percent
              if (f.status === "queued") return a
              return a + 100 // done / error / canceled
            }, 0) / runFiles.length
          )
        )
      : 0

  let info: string
  if (running) {
    const done = files.filter((f) => f.status === "done").length
    info = t("main.progress", { done, total: runFiles.length, pct: Math.round(overall) })
  } else if (runSummary) {
    const sp = Math.round(runSummary.savedPct)
    info = t("main.summary", {
      n: runSummary.count,
      saved: humanSize(runSummary.savedBytes),
      pct: sp < 0 ? `+${-sp}%` : `−${sp}%`,
      secs: (runSummary.spentMs / 1000).toFixed(2),
    })
  } else {
    const total = files.reduce((sum, f) => sum + f.size, 0)
    info = t("main.total", { n: files.length, size: humanSize(total) })
  }

  return (
    <div className="bg-background/40 relative flex shrink-0 items-center justify-between gap-3 px-4 pt-3.5 pb-2.5 backdrop-blur-xl">
      {/* Always-on progress track along the top edge — doubles as the bar's
          top border; the fill grows while a run is in flight. */}
      <div className="bg-primary/15 absolute inset-x-0 top-0 h-1 overflow-hidden">
        <div
          className="bg-primary h-full transition-[width] duration-500 ease-out"
          style={{ width: `${overall}%` }}
        />
      </div>
      <div className="text-muted-foreground min-w-0 truncate text-xs">{info}</div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={clearAll}
          disabled={running || files.length === 0}
        >
          {t("main.clear")}
        </Button>
        <Button
          size="sm"
          onClick={onCompress}
          disabled={running || pending === 0 || nameEmpty}
          title={nameEmpty ? t("main.nameRequired") : undefined}
          className="min-w-28"
        >
          {running ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("main.compressing")}
            </>
          ) : (
            t("main.compressN", { n: pending })
          )}
        </Button>
      </div>
    </div>
  )
}
