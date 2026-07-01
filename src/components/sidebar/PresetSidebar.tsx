import { useMemo } from "react"
import type { Category } from "@/types"
import { useAppStore } from "@/store/store"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PresetHeader } from "./PresetHeader"
import { OutputCard } from "./OutputCard"
import { TypeSettingsCard } from "./TypeSettingsCard"

// Image first, then video / gif / pdf.
const ORDER: Category[] = ["image", "video", "gif", "pdf"]

export function PresetSidebar() {
  const files = useAppStore((s) => s.files)
  const active = useMemo(() => new Set(files.map((f) => f.category)), [files])

  return (
    <ScrollArea className="h-full">
      <div className="space-y-2.5 p-3 pt-0">
        <PresetHeader />
        <OutputCard />
        {ORDER.map((cat) => (
          <TypeSettingsCard key={cat} category={cat} defaultOpen={active.has(cat)} />
        ))}
      </div>
    </ScrollArea>
  )
}
