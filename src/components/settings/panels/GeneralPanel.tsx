import { useEffect } from "react"
import { toast } from "sonner"
import type { Lang } from "@/types"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useSettingsStore } from "@/store/store"
import {
  getLaunchAtLogin,
  isTauri,
  requestNotifyPermission,
  setLaunchAtLogin,
} from "@/lib/tauri"
import { useT } from "@/lib/i18n"
import { Row, Section } from "../parts"

export function GeneralPanel() {
  const lang = useSettingsStore((s) => s.lang)
  const setLang = useSettingsStore((s) => s.setLang)
  const prefs = useSettingsStore((s) => s.prefs)
  const setPref = useSettingsStore((s) => s.setPref)
  const t = useT()

  useEffect(() => {
    if (!isTauri) return
    getLaunchAtLogin()
      .then((launchAtLogin) => setPref({ launchAtLogin }))
      .catch(() => {})
  }, [setPref])

  const desktopOnly = () => toast.info(t("toast.desktopOnly"))
  const toggleLaunchAtLogin = async (enabled: boolean) => {
    if (!isTauri) {
      desktopOnly()
      return
    }
    const previous = prefs.launchAtLogin
    setPref({ launchAtLogin: enabled })
    try {
      await setLaunchAtLogin(enabled)
    } catch {
      setPref({ launchAtLogin: previous })
      toast.error(t("toast.prefFailed"))
    }
  }
  const setNotifications = async (notifications: "never" | "complete") => {
    if (notifications === "complete") {
      try {
        const granted = await requestNotifyPermission()
        if (!granted) {
          setPref({ notifications: "never" })
          toast.error(t("toast.notificationDenied"))
          return
        }
      } catch {
        setPref({ notifications: "never" })
        toast.error(t("toast.notificationDenied"))
        return
      }
    }
    setPref({ notifications })
  }
  return (
    <>
      <Section title={t("prefs.language")}>
        <Row label={t("prefs.language")}>
          <Select value={lang} onValueChange={(v) => setLang(v as Lang)}>
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English · en</SelectItem>
              <SelectItem value="zh">简体中文 · zh</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Section>

      <Section title={t("prefs.generalTitle")}>
        <Row label={t("prefs.launchAtLogin")}>
          <Switch
            checked={prefs.launchAtLogin}
            disabled={!isTauri}
            onCheckedChange={(v) => void toggleLaunchAtLogin(v)}
          />
        </Row>
        <Row label={t("prefs.preventSleep")} desc={t("prefs.preventSleepDesc")}>
          <Switch
            checked={prefs.preventSleep}
            onCheckedChange={(v) => setPref({ preventSleep: v })}
          />
        </Row>
      </Section>

      <Section title={t("prefs.notificationsTitle")}>
        <Row label={t("prefs.notifications")}>
          <Select
            value={prefs.notifications}
            onValueChange={(v) => void setNotifications(v as "never" | "complete")}
          >
            <SelectTrigger size="sm" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="never">{t("prefs.notifyNever")}</SelectItem>
              <SelectItem value="complete">{t("prefs.notifyComplete")}</SelectItem>
            </SelectContent>
          </Select>
        </Row>
      </Section>
    </>
  )
}
