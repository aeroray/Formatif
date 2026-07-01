import { Check } from "lucide-react"
import type { Accent, Theme } from "@/types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { useSettingsStore } from "@/store/store"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Row, Section } from "../parts"

// Display swatches mirror the [data-accent] palettes in index.css.
const ACCENTS: { id: Accent; color: string }[] = [
  { id: "violet", color: "oklch(0.62 0.21 295)" },
  { id: "indigo", color: "oklch(0.585 0.2 277)" },
  { id: "azure", color: "oklch(0.62 0.16 244)" },
  { id: "emerald", color: "oklch(0.6 0.14 162)" },
  { id: "amber", color: "oklch(0.78 0.14 75)" },
  { id: "rose", color: "oklch(0.62 0.21 14)" },
  { id: "graphite", color: "oklch(0.72 0.014 285)" },
]

export function AppearancePanel() {
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)
  const accent = useSettingsStore((s) => s.accent)
  const setAccent = useSettingsStore((s) => s.setAccent)
  const t = useT()
  return (
    <Section title={t("prefs.appearanceTitle")}>
      <Row label={t("prefs.theme")}>
        <Select value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="system">{t("prefs.themeSystem")}</SelectItem>
            <SelectItem value="light">{t("prefs.themeLight")}</SelectItem>
            <SelectItem value="dark">{t("prefs.themeDark")}</SelectItem>
          </SelectContent>
        </Select>
      </Row>

      <div className="space-y-2 pt-1">
        <div className="text-sm">{t("prefs.accent")}</div>
        <div className="text-muted-foreground text-xs">{t("prefs.accentDesc")}</div>
        <div className="flex flex-wrap gap-2.5 pt-1">
          {ACCENTS.map((a) => (
            <Button
              key={a.id}
              variant="ghost"
              size="icon"
              aria-label={a.id}
              title={a.id}
              onClick={() => setAccent(a.id)}
              style={{ backgroundColor: a.color }}
              className={cn(
                "relative size-9 rounded-full p-0 transition-all hover:scale-110",
                accent === a.id
                  ? "ring-foreground ring-offset-background scale-110 ring-2 ring-offset-2"
                  : "ring-2 ring-inset ring-white/25 hover:ring-white/40"
              )}
            >
              {accent === a.id && (
                <Check className="size-5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]" />
              )}
            </Button>
          ))}
        </div>
      </div>
    </Section>
  )
}
