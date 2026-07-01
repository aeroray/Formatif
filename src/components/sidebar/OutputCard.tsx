import { useMemo, useState } from "react"
import { Folder, Info, Minus, Plus, SendToBack } from "lucide-react"
import type { OutputConfig } from "@/types"
import { useAppStore, useSettingsStore } from "@/store/store"
import { useT } from "@/lib/i18n"
import { isTauri, pickFolder } from "@/lib/tauri"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import { Chip } from "@/components/compression/Chip"
import { buildFilenameExample, FILENAME_VARS, FilenameInput } from "./FilenameInput"

// `presetId` targets a specific preset (the Settings panel edits the read-only
// default); omitted, it edits the workspace's active preset (sidebar).
export function OutputCard({ presetId }: { presetId?: string } = {}) {
  const id = useSettingsStore((s) => presetId ?? s.activePresetId)
  const preset = useSettingsStore((s) => s.presets.find((p) => p.id === id))
  const editPresetOutput = useSettingsStore((s) => s.editPresetOutput)
  const files = useAppStore((s) => s.files)
  const [open, setOpen] = useState(true)
  const t = useT()

  const output = preset?.output
  const example = useMemo(
    () =>
      output && preset
        ? buildFilenameExample(output.nameTemplate, files, preset.typeSettings)
        : "",
    [output, files, preset]
  )

  if (!output) return null
  const setOutput = (patch: Partial<OutputConfig>) => editPresetOutput(id, patch)

  return (
    <div className="bg-card/60 rounded-xl border backdrop-blur-xl">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        className="h-auto w-full justify-between px-3.5 py-2.5 font-semibold hover:bg-transparent"
      >
        <span className="flex min-w-0 items-center gap-2">
          <SendToBack className="text-muted-foreground size-4 shrink-0" />
          <span className="truncate">{t("output.title")}</span>
        </span>
        {open ? (
          <Minus className="text-muted-foreground size-4" />
        ) : (
          <Plus className="text-muted-foreground size-4" />
        )}
      </Button>

      {open && (
        <div className="space-y-2.5 px-3 pb-3">
          <div className="space-y-1.5">
            <div className="text-muted-foreground text-xs font-medium">
              {t("output.folder")}
            </div>
            <div className="flex gap-2">
              <Input
                readOnly
                value={output.folder ?? t("output.sameAsInput")}
                className="text-muted-foreground flex-1 text-xs"
              />
              <Button
                variant="outline"
                size="icon"
                aria-label={t("output.chooseFolder")}
                onClick={async () => {
                  if (!isTauri) return
                  const dir = await pickFolder()
                  setOutput({ folder: dir })
                }}
              >
                <Folder className="size-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
              {t("output.nameTemplate")}
              <HoverCard openDelay={100} closeDelay={60}>
                <HoverCardTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t("output.varsHint")}
                    className="text-muted-foreground/60 hover:text-foreground cursor-help"
                  >
                    <Info className="size-3.5" />
                  </Button>
                </HoverCardTrigger>
                <HoverCardContent align="start" className="w-64 text-xs">
                  <p className="mb-1.5 font-medium">{t("output.varsHint")}</p>
                  <div className="space-y-1">
                    {FILENAME_VARS.map((v) => (
                      <p key={v.id} className="flex gap-1.5">
                        <span className={cn("font-mono font-semibold", v.color)}>
                          {`{${v.id}}`}
                        </span>
                        <span className="text-muted-foreground">— {t(v.descKey)}</span>
                      </p>
                    ))}
                  </div>
                  <p className="text-muted-foreground/80 mt-2">{t("output.varsTip")}</p>
                </HoverCardContent>
              </HoverCard>
            </div>
            <FilenameInput
              value={output.nameTemplate}
              onChange={(v) => setOutput({ nameTemplate: v })}
              example={example}
            />
          </div>

          <div className="space-y-1.5">
            <div className="text-muted-foreground text-xs font-medium">
              {t("settings.more")}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Chip
                active={output.removeOriginal}
                label={t("output.removeOriginal")}
                onToggle={() => setOutput({ removeOriginal: !output.removeOriginal })}
              />
              <Chip
                active={output.fsMetadata}
                label={t("output.fsMetadata")}
                onToggle={() => setOutput({ fsMetadata: !output.fsMetadata })}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
