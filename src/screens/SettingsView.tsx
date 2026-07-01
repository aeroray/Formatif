import { ScrollArea } from "@/components/ui/scroll-area"
import { useAppStore } from "@/store/store"
import { SettingsNav } from "@/components/settings/SettingsNav"
import { GeneralPanel } from "@/components/settings/panels/GeneralPanel"
import { MediaPanel } from "@/components/settings/panels/MediaPanel"
import { MonitoringPanel } from "@/components/settings/panels/MonitoringPanel"
import { AppearancePanel } from "@/components/settings/panels/AppearancePanel"
import { ExtensionsPanel } from "@/components/settings/panels/ExtensionsPanel"
import { AboutPanel } from "@/components/settings/panels/AboutPanel"

// The back button + "Formatif · Settings" title live in the TitleBar.
export function SettingsView() {
  const section = useAppStore((s) => s.settingsSection)

  return (
    <div className="flex h-full min-h-0">
      <SettingsNav />
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-2xl space-y-3 p-5">
          {section === "general" && <GeneralPanel />}
          {section === "media" && <MediaPanel />}
          {section === "monitor" && <MonitoringPanel />}
          {section === "appearance" && <AppearancePanel />}
          {section === "extensions" && <ExtensionsPanel />}
          {section === "about" && <AboutPanel />}
        </div>
      </ScrollArea>
    </div>
  )
}
