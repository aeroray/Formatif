import { useState } from "react"
import { toast } from "sonner"
import {
  AlertCircle,
  Check,
  Columns2,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  Play,
  SlidersHorizontal,
  Video,
  X,
} from "lucide-react"
import type { Category, FileItem } from "@/types"
import { canPreview, canPreviewVideo, extOf, humanSize } from "@/lib/compress"
import { useAppStore, useSettingsStore } from "@/store/store"
import { isTauri, pathExists } from "@/lib/tauri"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { CompareDialog } from "./CompareDialog"
import { VideoPreviewDialog } from "./VideoPreviewDialog"
import { VideoCompareDialog } from "./VideoCompareDialog"

const CATEGORY_ICON: Record<Category, typeof ImageIcon> = {
  image: ImageIcon,
  video: Video,
  gif: Film,
  pdf: FileText,
}

const AUDIO_FORMATS = new Set(["mp3", "aac", "m4a", "wav", "flac", "ogg"])

export function FileCard({ file }: { file: FileItem }) {
  const openFilePanel = useAppStore((s) => s.openFilePanel)
  const removeFile = useAppStore((s) => s.removeFile)
  const removeOriginal = useSettingsStore((s) => s.output.removeOriginal)
  const globalSpec = useSettingsStore((s) => s.typeSettings[file.category])
  const t = useT()
  const [compareOpen, setCompareOpen] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)

  const Icon = CATEGORY_ICON[file.category]
  const busy = file.status === "compressing" || file.status === "queued"
  const done = file.status === "done" && file.result
  const failed = file.status === "error"
  const modified = !!file.override // per-file settings have been customized

  // A clear, localized reason for a failed job (shown on hover). FFmpeg's raw
  // message is cryptic, so map the common cases (missing codec / no audio).
  const effFormat = file.override?.format ?? globalSpec.format
  const errMsg = !failed
    ? ""
    : /encoder not found|unknown encoder/i.test(file.error ?? "")
      ? t("error.codecMissing")
      : AUDIO_FORMATS.has(effFormat)
        ? t("error.audioNoStream")
        : file.error || t("error.generic")

  // Compression can occasionally enlarge a file (e.g. re-encoding an already
  // small source); show that honestly instead of a misleading "−" saving.
  const savedPct = file.result?.savedPct ?? 0
  const grew = !!done && savedPct < 0
  const pctLabel = grew ? `+${Math.round(-savedPct)}%` : `−${Math.round(savedPct)}%`

  // Only offer preview/compare for formats the webview can actually render.
  const outExt = file.result ? extOf(file.result.outputPath) : ""
  const playable = file.isVideo && canPreviewVideo(file.ext)
  const canCompare =
    !!done &&
    !removeOriginal &&
    // PDFs are compared by rasterising their first page (pdf.js); image/video/gif
    // need both sides to be webview-renderable.
    (file.category === "pdf" ||
      ((file.category === "image" ||
        file.category === "video" ||
        file.category === "gif") &&
        canPreview(file.ext) &&
        canPreview(outExt)))

  // Compare needs BOTH the original and the compressed output; if either was
  // deleted/moved, say which one so the message is accurate.
  const openCompare = async () => {
    if (isTauri) {
      if (!(await pathExists(file.path).catch(() => false))) {
        toast.error(t("compare.missingInput"))
        return
      }
      const out = file.result?.outputPath
      if (!out || !(await pathExists(out).catch(() => false))) {
        toast.error(t("compare.missingOutput"))
        return
      }
    }
    setCompareOpen(true)
  }
  const openVideo = async () => {
    if (isTauri && !(await pathExists(file.path).catch(() => false))) {
      toast.error(t("preview.unavailable"))
      return
    }
    setVideoOpen(true)
  }

  return (
    <div className="group bg-secondary/30 relative aspect-square overflow-hidden rounded-xl border">
      {/* thumbnail or fallback */}
      {file.thumbnail ? (
        <img
          src={file.thumbnail}
          alt=""
          className={cn(
            "h-full w-full object-cover transition-[filter,transform] duration-300",
            busy && "scale-105 blur-md"
          )}
          draggable={false}
        />
      ) : file.thumbPending ? (
        <div className="text-muted-foreground/40 flex h-full w-full items-center justify-center">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : (
        <div
          className={cn(
            "text-muted-foreground/40 flex h-full w-full items-center justify-center transition",
            busy && "blur-[2px]"
          )}
        >
          <Icon className="size-10" />
        </div>
      )}

      {/* bottom legibility gradient + label */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-2.5 pt-6 pb-2 text-xs font-medium text-white">
        {done ? (
          <span>
            {humanSize(file.size)}{" "}
            <span className={grew ? "text-amber-400" : "text-emerald-400"}>
              → {humanSize(file.result!.outputSize)}
            </span>
          </span>
        ) : (
          <span className="uppercase">
            {file.ext} · {humanSize(file.size)}
          </span>
        )}
      </div>

      {/* top-left: saved badge when done, else settings gear */}
      {done ? (
        <span
          className={cn(
            "absolute top-2 left-2 rounded-md px-1.5 py-0.5 text-xs font-semibold text-white",
            grew ? "bg-amber-500/90" : "bg-emerald-500/90"
          )}
        >
          {pctLabel}
        </span>
      ) : (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => openFilePanel(file.id)}
          aria-label={t("a11y.fileSettings")}
          className={cn(
            "absolute top-2 left-2 backdrop-blur-sm",
            modified
              ? "bg-primary text-primary-foreground hover:bg-primary/90 opacity-100 shadow-sm"
              : "bg-black/55 text-white opacity-0 group-hover:opacity-100 hover:bg-black/70 hover:text-white"
          )}
        >
          <SlidersHorizontal className="size-3.5" />
        </Button>
      )}

      {/* top-right: remove */}
      {!busy && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => removeFile(file.id)}
          aria-label={t("a11y.remove")}
          className="hover:bg-destructive absolute top-2 right-2 bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:text-white"
        >
          <X className="size-3.5" />
        </Button>
      )}

      {/* center overlay */}
      {busy && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
          <div className="flex flex-col items-center gap-1 text-white drop-shadow">
            <Loader2 className="size-6 animate-spin" />
            {file.status === "compressing" && (
              <span className="text-xs font-medium">{Math.round(file.percent)}%</span>
            )}
          </div>
        </div>
      )}
      {done && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="flex size-9 items-center justify-center rounded-full bg-emerald-500/90 text-white shadow-lg">
            <Check className="size-5" />
          </span>
        </div>
      )}
      {!busy && !done && playable && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Button
            variant="ghost"
            onClick={openVideo}
            aria-label={t("preview.play")}
            title={t("preview.play")}
            className="hover:bg-primary pointer-events-auto size-11 rounded-full bg-black/55 text-white backdrop-blur-sm transition-all hover:scale-110 hover:text-white"
          >
            <Play className="size-5 translate-x-px fill-current" />
          </Button>
        </div>
      )}
      {failed && (
        <HoverCard openDelay={100} closeDelay={60}>
          <HoverCardTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("error.title")}
              className="absolute right-2 bottom-2 bg-black/55 text-red-500 backdrop-blur-sm hover:bg-black/70 hover:text-red-500"
            >
              <AlertCircle className="size-3.5" />
            </Button>
          </HoverCardTrigger>
          <HoverCardContent side="top" align="end" className="w-auto max-w-56 text-xs text-white">
            {errMsg}
          </HoverCardContent>
        </HoverCard>
      )}

      {/* before/after comparison — only when both sides are previewable and the
          original is still around */}
      {canCompare && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={openCompare}
          aria-label={t("compare.open")}
          title={t("compare.open")}
          className="absolute right-2 bottom-2 bg-black/55 text-white backdrop-blur-sm hover:bg-black/80 hover:text-white"
        >
          <Columns2 className="size-3.5" />
        </Button>
      )}
      {compareOpen &&
        // Use the video compare (which renders <video>/<img> per side) when
        // either side is a playable video; otherwise the image/PDF dialog.
        (file.category !== "pdf" &&
        (canPreviewVideo(file.ext) || canPreviewVideo(outExt)) ? (
          <VideoCompareDialog file={file} onClose={() => setCompareOpen(false)} />
        ) : (
          <CompareDialog file={file} onClose={() => setCompareOpen(false)} />
        ))}
      {videoOpen && (
        <VideoPreviewDialog file={file} onClose={() => setVideoOpen(false)} />
      )}
    </div>
  )
}
