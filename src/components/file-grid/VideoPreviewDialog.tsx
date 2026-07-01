import { useState } from "react"
import { Loader2 } from "lucide-react"
import type { FileItem } from "@/types"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { assetSrc } from "@/lib/tauri"

/** In-app video preview. Only opened for formats the webview can play. */
export function VideoPreviewDialog({
  file,
  onClose,
}: {
  file: FileItem
  onClose: () => void
}) {
  const [loading, setLoading] = useState(true)
  const done = () => setLoading(false)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-background/60 gap-3 p-4 backdrop-blur-2xl backdrop-saturate-150 sm:max-w-4xl">
        <DialogTitle className="truncate pr-8 text-sm">{file.name}</DialogTitle>
        <div className="relative w-full overflow-hidden rounded-lg bg-black">
          <video
            src={assetSrc(file.path)}
            controls
            autoPlay
            className="max-h-[80vh] w-full"
            onLoadedData={done}
            onCanPlay={done}
            onError={done}
          />
          {loading && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Loader2 className="size-7 animate-spin text-white/90" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
