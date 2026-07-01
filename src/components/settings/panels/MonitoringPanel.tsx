import { Check, Folder, Plus, X } from "lucide-react"
import type { Category } from "@/types"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SegmentedButtons } from "@/components/compression/SegmentedButtons"
import { useSettingsStore } from "@/store/store"
import { isTauri, pickFolders } from "@/lib/tauri"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Section } from "../parts"

const DEPTHS = ["0", "1", "2", "3", "4", "5", "99"]
const TYPE_ORDER: Category[] = ["pdf", "gif", "video", "image"]

export function MonitoringPanel() {
  const folderDepth = useSettingsStore((s) => s.folderDepth)
  const setFolderDepth = useSettingsStore((s) => s.setFolderDepth)
  const folderTypes = useSettingsStore((s) => s.folderTypes)
  const toggleFolderType = useSettingsStore((s) => s.toggleFolderType)
  const watchFolders = useSettingsStore((s) => s.watchFolders)
  const addWatchFolders = useSettingsStore((s) => s.addWatchFolders)
  const removeWatchFolder = useSettingsStore((s) => s.removeWatchFolder)
  const presets = useSettingsStore((s) => s.presets)
  const watchPresetId = useSettingsStore((s) => s.watchPresetId)
  const setWatchPreset = useSettingsStore((s) => s.setWatchPreset)
  const t = useT()

  const onAdd = async () => {
    if (!isTauri) return
    const dirs = await pickFolders()
    if (dirs.length) addWatchFolders(dirs)
  }

  return (
    <>
      <Section title={t("monitor.folderProcessing")}>
        <div className="space-y-2">
          <div className="text-muted-foreground text-xs font-medium">
            {t("monitor.allowedDepth")}
          </div>
          <SegmentedButtons
            options={DEPTHS.map((d) => ({ value: d, label: d === "99" ? "∞" : d }))}
            value={String(folderDepth)}
            onChange={(v) => setFolderDepth(Number(v))}
          />
        </div>
        <div className="space-y-2">
          <div className="text-muted-foreground text-xs font-medium">
            {t("monitor.filterTypes")}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {TYPE_ORDER.map((c) => (
              <Button
                key={c}
                variant="ghost"
                size="compact"
                onClick={() => toggleFolderType(c)}
                className="h-auto gap-2 px-0 py-0 text-sm font-normal hover:bg-transparent"
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-[6px] border transition-colors",
                    folderTypes[c]
                      ? "bg-primary border-primary text-white"
                      : "border-input"
                  )}
                >
                  {folderTypes[c] && <Check className="size-3.5" />}
                </span>
                {t(`cat.${c}`)}
              </Button>
            ))}
          </div>
        </div>
      </Section>

      <Section
        title={t("monitor.watchTitle")}
        action={
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0 gap-1.5"
            disabled={!isTauri}
            onClick={onAdd}
          >
            <Plus className="size-4" />
            {t("monitor.addFolders")}
          </Button>
        }
      >
        <p className="text-muted-foreground -mt-1 text-xs">{t("monitor.presetNote")}</p>

        <div className="space-y-1.5">
          <div className="text-muted-foreground text-xs font-medium">
            {t("monitor.preset")}
          </div>
          <Select value={watchPresetId} onValueChange={setWatchPreset}>
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {presets.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.builtin ? t("preset.default") : p.name || t("preset.untitled")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {watchFolders.length === 0 ? (
          <div className="text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed px-3 py-4 text-sm">
            <Folder className="size-4" />
            {t("monitor.noFolders")}
          </div>
        ) : (
          <div className="divide-border divide-y rounded-lg border">
            {watchFolders.map((p) => (
              <div key={p} className="flex items-center gap-2 px-3 py-2">
                <Folder className="text-muted-foreground size-4 shrink-0" />
                <span className="flex-1 truncate text-sm" title={p}>
                  {p}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeWatchFolder(p)}
                  aria-label={t("a11y.remove")}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </>
  )
}
