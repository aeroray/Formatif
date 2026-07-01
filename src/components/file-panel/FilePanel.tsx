import { useState } from "react"
import { RotateCcw, X } from "lucide-react"
import { useAppStore, useSettingsStore } from "@/store/store"
import { useT } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CompressionControls } from "@/components/compression/CompressionControls"

export function FilePanel() {
  const id = useAppStore((s) => s.filePanelId)
  const file = useAppStore((s) => s.files.find((f) => f.id === id))
  const close = useAppStore((s) => s.closeFilePanel)
  const setOverride = useAppStore((s) => s.setOverride)
  const presets = useSettingsStore((s) => s.presets)
  const activePresetId = useSettingsStore((s) => s.activePresetId)
  const t = useT()

  // Which preset the dropdown shows — starts on the workspace's active preset.
  const [presetId, setPresetId] = useState(activePresetId)

  if (!file) return null
  const selectedPreset =
    presets.find((p) => p.id === presetId) ??
    presets.find((p) => p.id === activePresetId) ??
    presets[0]
  const selectedSpec = selectedPreset.typeSettings[file.category]
  const spec = file.override ?? selectedSpec
  // "Custom": the file's settings were tweaked away from the chosen preset, so
  // they belong to no preset (a temporary, file-only configuration). The preset
  // dropdown is then disabled and shows the "temporary" label.
  const isCustom =
    !!file.override &&
    !(
      file.override.quality === selectedSpec.quality &&
      file.override.resolution === selectedSpec.resolution &&
      file.override.format === selectedSpec.format &&
      (file.override.frameRate ?? null) === (selectedSpec.frameRate ?? null) &&
      (file.override.simplifiedPalette ?? false) ===
        (selectedSpec.simplifiedPalette ?? false)
    )

  const applyPreset = (pid: string) => {
    setPresetId(pid)
    // Picking the workspace's own preset means "inherit it" → clear the override
    // (so switching to another preset and back counts as no change).
    if (pid === activePresetId) {
      setOverride(file.id, undefined)
    } else {
      const p = presets.find((x) => x.id === pid)
      if (p) setOverride(file.id, { ...p.typeSettings[file.category] })
    }
  }
  const reset = () => {
    setPresetId(activePresetId)
    setOverride(file.id, undefined) // inherit the workspace's active preset
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={close} />
      <div className="bg-popover relative flex h-full w-[360px] flex-col border-l shadow-2xl">
        <header className="flex items-start justify-between gap-2 border-b px-4 py-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold">{t("filePanel.title")}</div>
            <div className="text-muted-foreground truncate text-xs">{file.name}</div>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("a11y.close")}
            onClick={close}
            className="shrink-0"
          >
            <X className="size-4" />
          </Button>
        </header>

        <ScrollArea className="flex-1">
          <div className="space-y-3 p-4">
            <div className="space-y-1.5">
              <div className="text-muted-foreground text-xs font-medium">
                {t("filePanel.preset")}
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={isCustom ? "" : presetId}
                  onValueChange={applyPreset}
                  disabled={isCustom}
                >
                  <SelectTrigger size="sm" className="flex-1">
                    <SelectValue placeholder={t("filePanel.custom")} />
                  </SelectTrigger>
                  <SelectContent>
                    {presets.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.builtin ? t("preset.default") : p.name || t("preset.untitled")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("filePanel.reset")}
                  title={t("filePanel.reset")}
                  disabled={!file.override && presetId === activePresetId}
                  onClick={reset}
                >
                  <RotateCcw className="size-4" />
                </Button>
              </div>
            </div>

            <CompressionControls
              category={file.category}
              spec={spec}
              onChange={(patch) => setOverride(file.id, { ...spec, ...patch })}
            />
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}
