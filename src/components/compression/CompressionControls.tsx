import type { Category, CompressionSpec } from "@/types"
import { FORMATS, OPTION_CHIPS, QUALITY_PRESETS, RESOLUTIONS } from "@/lib/compress"
import { useT } from "@/lib/i18n"
import { SegmentedButtons } from "./SegmentedButtons"
import { Chip } from "./Chip"

const DEFAULT_FPS = 15

export function CompressionControls({
  category,
  spec,
  onChange,
}: {
  category: Category
  spec: CompressionSpec
  onChange: (patch: Partial<CompressionSpec>) => void
}) {
  const t = useT()
  const hasResolution = category !== "pdf"
  const hasFormat = category !== "pdf"
  const optionChips = OPTION_CHIPS[category]

  return (
    <div className="space-y-3">
      <Field label={t("settings.quality")}>
        <SegmentedButtons
          options={QUALITY_PRESETS.map((q) => ({ value: q, label: t(`quality.${q}`) }))}
          value={spec.quality}
          onChange={(v) => onChange({ quality: v as CompressionSpec["quality"] })}
        />
      </Field>

      {hasResolution && (
        <Field label={t("settings.resolution")}>
          <SegmentedButtons
            options={RESOLUTIONS.map((r) => ({
              value: r,
              label: `${r}x`,
            }))}
            value={spec.resolution}
            onChange={(v) => onChange({ resolution: v as CompressionSpec["resolution"] })}
          />
        </Field>
      )}

      {hasFormat && (
        <Field label={t("settings.format")}>
          <SegmentedButtons
            options={FORMATS[category].map((f) => ({ value: f, label: t(`format.${f}`) }))}
            value={spec.format}
            onChange={(v) => onChange({ format: v })}
          />
        </Field>
      )}

      {optionChips.length > 0 && (
        <Field label={t("settings.more")}>
          <div className="flex flex-wrap gap-1.5">
            {optionChips.map((chip) => {
              if (chip.key === "frameRate") {
                const active = spec.frameRate != null
                return (
                  <Chip
                    key="frameRate"
                    active={active}
                    label={
                      active
                        ? `${t("opt.frameRate")} · ${spec.frameRate}`
                        : t("opt.frameRate")
                    }
                    onToggle={() =>
                      onChange({ frameRate: active ? null : DEFAULT_FPS })
                    }
                  />
                )
              }
              const active = !!spec.simplifiedPalette
              return (
                <Chip
                  key="simplifiedPalette"
                  active={active}
                  label={t("opt.simplifiedPalette")}
                  onToggle={() => onChange({ simplifiedPalette: !active })}
                />
              )
            })}
          </div>
        </Field>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-muted-foreground text-xs font-medium">{label}</div>
      {children}
    </div>
  )
}
