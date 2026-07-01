import type { Category } from "@/types"
import { useT } from "@/lib/i18n"
import { OutputCard } from "@/components/sidebar/OutputCard"
import { TypeSettingsCard } from "@/components/sidebar/TypeSettingsCard"
import { Section } from "../parts"

const ORDER: Category[] = ["image", "video", "gif", "pdf"]

// Edits the read-only "Default preset" (the only place it can be changed).
export function MediaPanel() {
  const t = useT()
  return (
    <Section title={t("prefs.mediaTitle")}>
      <p className="text-muted-foreground text-xs">{t("prefs.mediaDesc")}</p>
      <div className="space-y-3">
        <OutputCard presetId="default" />
        {ORDER.map((c) => (
          <TypeSettingsCard key={c} category={c} presetId="default" />
        ))}
      </div>
    </Section>
  )
}
