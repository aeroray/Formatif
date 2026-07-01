import { useState } from "react"
import { FileText, Film, Image as ImageIcon, Minus, Plus, Video } from "lucide-react"
import type { Category } from "@/types"
import { Button } from "@/components/ui/button"
import { useSettingsStore } from "@/store/store"
import { useT } from "@/lib/i18n"
import { CompressionControls } from "@/components/compression/CompressionControls"

const CATEGORY_ICON: Record<Category, typeof ImageIcon> = {
  image: ImageIcon,
  video: Video,
  gif: Film,
  pdf: FileText,
}

export function TypeSettingsCard({
  category,
  defaultOpen = false,
  presetId,
}: {
  category: Category
  defaultOpen?: boolean
  presetId?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useSettingsStore((s) => presetId ?? s.activePresetId)
  const spec = useSettingsStore((s) => s.presets.find((p) => p.id === id)?.typeSettings[category])
  const editPresetSpec = useSettingsStore((s) => s.editPresetSpec)
  const t = useT()
  const Icon = CATEGORY_ICON[category]

  return (
    <div className="bg-card/60 rounded-xl border backdrop-blur-xl">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        className="h-auto w-full justify-between px-3.5 py-2.5 font-semibold hover:bg-transparent"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Icon className="text-muted-foreground size-4 shrink-0" />
          <span className="truncate">{t(`settings.${category}`)}</span>
        </span>
        {open ? (
          <Minus className="text-muted-foreground size-4" />
        ) : (
          <Plus className="text-muted-foreground size-4" />
        )}
      </Button>
      {open && spec && (
        <div className="px-3 pb-3">
          <CompressionControls
            category={category}
            spec={spec}
            onChange={(patch) => editPresetSpec(id, category, patch)}
          />
        </div>
      )}
    </div>
  )
}
