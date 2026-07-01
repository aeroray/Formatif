import { useState, type ReactNode } from "react"
import { ChevronsLeftRight, Loader2, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react"
import { ReactCompareSlider } from "react-compare-slider"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n"

const MIN_ZOOM = 1
const MAX_ZOOM = 4
const STEP = 1.4

// A slim divider + a comfortably-grabbable grip.
const handle = (
  <div className="relative flex h-full w-8 cursor-ew-resize items-center justify-center">
    <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white/85 shadow-[0_0_3px_rgba(0,0,0,0.5)]" />
    <div className="text-neutral-700 relative flex size-8 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-black/10">
      <ChevronsLeftRight className="size-4" />
    </div>
  </div>
)

/** Shared before/after compare dialog: a slider + corner labels. Zoom scales
 *  the content from the centre and clips it (no scrollbars); the slider always
 *  spans the visible area. The box adopts the content's aspect ratio. */
export function CompareShell({
  name,
  beforeLabel,
  afterLabel,
  itemOne,
  itemTwo,
  aspectRatio,
  loading = false,
  onClose,
}: {
  name: string
  beforeLabel: string
  afterLabel: string
  itemOne: ReactNode
  itemTwo: ReactNode
  aspectRatio?: number
  loading?: boolean
  onClose: () => void
}) {
  const t = useT()
  const [zoom, setZoom] = useState(1)
  const ar = aspectRatio && aspectRatio > 0 ? aspectRatio : 16 / 9

  const clamp = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
  // Magnify each side from the centre; the box clips the overflow.
  const scaled = (node: ReactNode) => (
    <div
      className="h-full w-full"
      style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
    >
      {node}
    </div>
  )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="bg-background/60 gap-3 p-4 backdrop-blur-2xl backdrop-saturate-150 sm:max-w-4xl"
      >
        {/* header: title + aligned, equally-sized controls */}
        <div className="flex items-center justify-between gap-2">
          <DialogTitle className="min-w-0 truncate text-sm">{name}</DialogTitle>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("compare.zoomOut")}
              title={t("compare.zoomOut")}
              disabled={zoom <= MIN_ZOOM}
              onClick={() => setZoom((z) => clamp(z / STEP))}
            >
              <ZoomOut className="size-4" />
            </Button>
            <span className="text-muted-foreground w-10 text-center text-xs tabular-nums">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("compare.zoomIn")}
              title={t("compare.zoomIn")}
              disabled={zoom >= MAX_ZOOM}
              onClick={() => setZoom((z) => clamp(z * STEP))}
            >
              <ZoomIn className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("compare.resetZoom")}
              title={t("compare.resetZoom")}
              disabled={zoom === 1}
              onClick={() => setZoom(1)}
            >
              <RotateCcw className="size-4" />
            </Button>
            <DialogClose asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("a11y.close")}>
                <X className="size-4" />
              </Button>
            </DialogClose>
          </div>
        </div>

        {/* preview: box adopts content aspect (capped at the viewport); content
            scales from the centre and is clipped — no scrollbars, and the
            compare slider always stays within the visible area */}
        <div className="relative">
          <div
            className="relative mx-auto overflow-hidden rounded-lg bg-black/40 select-none"
            style={{ aspectRatio: ar, maxHeight: "76vh", maxWidth: "100%" }}
          >
            <ReactCompareSlider
              className="h-full w-full"
              handle={handle}
              itemOne={scaled(itemOne)}
              itemTwo={scaled(itemTwo)}
            />
            {loading && (
              <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
                <Loader2 className="size-7 animate-spin text-white/90" />
              </div>
            )}
          </div>
          <span className="pointer-events-none absolute top-2 left-2 z-30 rounded bg-black/70 px-2 py-1 text-xs font-medium text-white">
            {beforeLabel}
          </span>
          <span className="pointer-events-none absolute top-2 right-2 z-30 rounded bg-black/70 px-2 py-1 text-xs font-medium text-white">
            {afterLabel}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  )
}
