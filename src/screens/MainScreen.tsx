import { useCallback } from "react"
import { toast } from "sonner"
import { useAppStore } from "@/store/store"
import { isTauri, pickFiles } from "@/lib/tauri"
import { tx } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { useDragDrop } from "@/hooks/useDragDrop"
import { useIngest } from "@/hooks/useIngest"
import { useRunCompression } from "@/hooks/useRunCompression"
import { EmptyDropzone } from "@/components/file-grid/EmptyDropzone"
import { FileGrid } from "@/components/file-grid/FileGrid"
import { PresetSidebar } from "@/components/sidebar/PresetSidebar"
import { BottomBar } from "@/components/action-bar/BottomBar"
import { FilePanel } from "@/components/file-panel/FilePanel"

export function MainScreen() {
  const files = useAppStore((s) => s.files)
  const ingest = useIngest()
  const run = useRunCompression()
  const { isDragging } = useDragDrop(ingest)

  const onBrowse = useCallback(async () => {
    if (!isTauri) {
      toast.info(tx("toast.desktopOnly"))
      return
    }
    const paths = await pickFiles()
    if (paths.length) ingest(paths)
  }, [ingest])

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex min-h-0 flex-1 gap-2 p-2">
        {/* drop area — dashed border always visible; highlights while dragging */}
        <div
          className={cn(
            "min-w-0 flex-1 overflow-auto rounded-2xl border-2 border-dashed transition-colors",
            isDragging ? "border-primary bg-primary/5" : "border-border/70"
          )}
        >
          {files.length === 0 ? (
            <EmptyDropzone onBrowse={onBrowse} />
          ) : (
            <div className="p-3">
              <FileGrid onBrowse={onBrowse} />
            </div>
          )}
        </div>
        {/* config pane — 40% of the window (drop area gets the other 60%) */}
        <div className="w-2/5 min-w-[320px] shrink-0 overflow-hidden">
          <PresetSidebar />
        </div>
      </div>
      {files.length > 0 && <BottomBar onCompress={run} />}
      <FilePanel />
    </div>
  )
}
