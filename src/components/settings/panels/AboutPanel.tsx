import { useEffect, useState } from "react"
import { toast } from "sonner"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/Logo"
import { getAppVersion } from "@/lib/tauri"
import { useT } from "@/lib/i18n"
import { Section } from "../parts"

export function AboutPanel() {
  const [version, setVersion] = useState("")
  const t = useT()

  useEffect(() => {
    getAppVersion()
      .then(setVersion)
      .catch(() => {})
  }, [])

  return (
    <Section title={t("prefs.about")}>
      <div className="flex items-center gap-3">
        <Logo className="size-11 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{t("app.name")}</div>
          <div className="text-muted-foreground text-xs">
            {t("prefs.version")} {version}
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => toast.message(t("prefs.comingSoon"))}
        >
          <RefreshCw className="size-4" />
          {t("prefs.softwareUpdate")}
        </Button>
      </div>
    </Section>
  )
}
