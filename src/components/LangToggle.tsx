import { Languages } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useSettingsStore } from "@/store/store"
import { useT } from "@/lib/i18n"

export function LangToggle() {
  const lang = useSettingsStore((s) => s.lang)
  const setLang = useSettingsStore((s) => s.setLang)
  const t = useT()

  return (
    <Button
      variant="ghost"
      size="compact"
      className="text-muted-foreground hover:text-foreground font-medium"
      aria-label={t("a11y.lang")}
      onClick={() => setLang(lang === "zh" ? "en" : "zh")}
    >
      <Languages className="size-4" />
      {lang === "zh" ? "简体中文" : "English"}
    </Button>
  )
}
