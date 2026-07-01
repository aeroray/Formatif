import type { ComponentType } from "react"
import { FolderSync, Info, Palette, Settings, SlidersHorizontal } from "lucide-react"
import type { SettingsSection } from "@/types"
import { Button } from "@/components/ui/button"
import { useAppStore } from "@/store/store"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

type Item = { id: SettingsSection; label: string; icon: ComponentType<{ className?: string }> }

const ITEMS: Item[] = [
  { id: "general", label: "prefs.nav.general", icon: Settings },
  { id: "media", label: "prefs.nav.media", icon: SlidersHorizontal },
  { id: "monitor", label: "prefs.nav.monitor", icon: FolderSync },
  { id: "appearance", label: "prefs.nav.appearance", icon: Palette },
  { id: "about", label: "prefs.nav.about", icon: Info },
]

export function SettingsNav() {
  const section = useAppStore((s) => s.settingsSection)
  const setSection = useAppStore((s) => s.setSettingsSection)
  const t = useT()

  return (
    <nav className="w-56 shrink-0 space-y-1 overflow-auto p-3">
      {ITEMS.map((it) => {
        const active = section === it.id
        const Icon = it.icon
        return (
          <Button
            key={it.id}
            variant="ghost"
            size="compact"
            onClick={() => setSection(it.id)}
            className={cn(
              "w-full justify-start gap-2 font-normal",
              active
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
            )}
          >
            <Icon className="size-4" />
            {t(it.label)}
          </Button>
        )
      })}
    </nav>
  )
}
