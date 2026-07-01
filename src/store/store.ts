import { create } from "zustand"
import { persist } from "zustand/middleware"
import type {
  Accent,
  AppView,
  CompressionSpec,
  Category,
  FileItem,
  Lang,
  OutputConfig,
  Preset,
  RunSummary,
  SettingsSection,
  Theme,
  ToolStatus,
  TypeSettings,
} from "@/types"
import { defaultTypeSettings } from "@/lib/compress"

// Shallow-clone per-category specs so presets don't share object references.
function cloneTypeSettings(ts: TypeSettings): TypeSettings {
  return {
    image: { ...ts.image },
    video: { ...ts.video },
    gif: { ...ts.gif },
    pdf: { ...ts.pdf },
  }
}

function cloneOutput(o: OutputConfig): OutputConfig {
  return { ...o }
}

// Two presets ship by default: a read-only "Default preset" (the template +
// fallback, edited only in Settings, hidden from the sidebar) and an editable
// "Unnamed preset" that the workspace opens on.
function defaultPresets(): Preset[] {
  return [
    {
      id: "default",
      name: "",
      builtin: true,
      output: { ...DEFAULT_OUTPUT },
      typeSettings: defaultTypeSettings(),
    },
    {
      id: "unnamed",
      name: "",
      output: { ...DEFAULT_OUTPUT },
      typeSettings: defaultTypeSettings(),
    },
  ]
}

// Inlined (not imported from i18n) to avoid a store <-> i18n import cycle.
function detectInitialLang(): Lang {
  const l =
    typeof navigator !== "undefined" && navigator.language
      ? navigator.language.toLowerCase()
      : "en"
  return l.startsWith("zh") ? "zh" : "en"
}

// ============================ settings (persisted) ============================

interface Prefs {
  launchAtLogin: boolean
  preventSleep: boolean
  notifications: "never" | "complete"
}

interface SettingsStore {
  lang: Lang
  theme: Theme
  accent: Accent
  typeSettings: TypeSettings // mirror of the active preset's settings
  presets: Preset[]
  activePresetId: string
  output: OutputConfig
  prefs: Prefs
  folderDepth: number // 0..5, or 99 for ∞
  folderTypes: Record<Category, boolean>
  watchFolders: string[]
  watchEnabled: boolean
  watchPresetId: string // preset the folder watcher compresses with

  setLang: (lang: Lang) => void
  setTheme: (theme: Theme) => void
  setAccent: (accent: Accent) => void
  setFolderDepth: (n: number) => void
  toggleFolderType: (c: Category) => void
  addWatchFolders: (paths: string[]) => void
  removeWatchFolder: (path: string) => void
  setWatchEnabled: (on: boolean) => void
  setTypeSpec: (category: Category, patch: Partial<CompressionSpec>) => void
  resetTypeSpec: (category: Category) => void
  selectPreset: (id: string) => void
  addPreset: (name?: string) => string
  removePreset: (id: string) => void
  renamePreset: (id: string, name: string) => void
  reorderPresets: (fromId: string, toId: string) => void
  resetPreset: (id: string) => void
  setOutput: (patch: Partial<OutputConfig>) => void
  // Edit a specific preset directly (used by Settings to edit the read-only
  // default preset); also keeps the active mirror in sync when id is active.
  editPresetSpec: (id: string, category: Category, patch: Partial<CompressionSpec>) => void
  editPresetOutput: (id: string, patch: Partial<OutputConfig>) => void
  setWatchPreset: (id: string) => void
  setPref: (patch: Partial<Prefs>) => void
}

const DEFAULT_OUTPUT: OutputConfig = {
  folder: null,
  nameTemplate: "{input}_{quality}",
  removeOriginal: false,
  fsMetadata: false,
}

// Migrate retired resolution scales in persisted state: 0.33 → 0.25 (renamed),
// custom → 1 (the custom option was removed).
const RES_MIGRATE: Record<string, CompressionSpec["resolution"]> = {
  "0.33": "0.25",
  custom: "1",
}
// Retired output formats (uncompressed/weak codecs that enlarge files): reset
// any persisted selection back to "original". (mpeg = MPEG-2 video.)
const DROPPED_FORMATS = new Set(["tiff", "bmp", "tga", "jp2", "mpeg"])
function migrateSpec(spec: CompressionSpec): CompressionSpec {
  let next = spec
  const res = RES_MIGRATE[next.resolution as string]
  if (res) next = { ...next, resolution: res }
  if (DROPPED_FORMATS.has(next.format)) next = { ...next, format: "original" }
  return next
}
function migrateTypeSettings(ts: TypeSettings): TypeSettings {
  return {
    image: migrateSpec(ts.image),
    video: migrateSpec(ts.video),
    gif: migrateSpec(ts.gif),
    pdf: migrateSpec(ts.pdf),
  }
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      lang: detectInitialLang(),
      theme: "dark",
      accent: "violet",
      typeSettings: defaultTypeSettings(),
      presets: defaultPresets(),
      activePresetId: "unnamed",
      output: { ...DEFAULT_OUTPUT },
      prefs: {
        launchAtLogin: false,
        preventSleep: false,
        notifications: "never",
      },
      folderDepth: 0,
      folderTypes: { image: true, video: true, gif: true, pdf: true },
      watchFolders: [],
      watchEnabled: false,
      watchPresetId: "default",

      setLang: (lang) => set({ lang }),
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setFolderDepth: (folderDepth) => set({ folderDepth }),
      toggleFolderType: (c) =>
        set((s) => ({ folderTypes: { ...s.folderTypes, [c]: !s.folderTypes[c] } })),
      addWatchFolders: (paths) =>
        set((s) => ({ watchFolders: [...new Set([...s.watchFolders, ...paths])] })),
      removeWatchFolder: (path) =>
        set((s) => ({ watchFolders: s.watchFolders.filter((p) => p !== path) })),
      setWatchEnabled: (watchEnabled) => set({ watchEnabled }),
      // Editing settings writes through to the active preset so the change
      // sticks when switching presets and back.
      // Editing the sidebar writes through to the active preset. The read-only
      // default is never the sidebar's active preset's editable target, so guard.
      setTypeSpec: (category, patch) =>
        set((s) => {
          const active = s.presets.find((p) => p.id === s.activePresetId)
          if (active?.builtin) return {} // read-only default — edit it in Settings
          const typeSettings = {
            ...s.typeSettings,
            [category]: { ...s.typeSettings[category], ...patch },
          }
          return {
            typeSettings,
            presets: s.presets.map((p) =>
              p.id === s.activePresetId ? { ...p, typeSettings: cloneTypeSettings(typeSettings) } : p
            ),
          }
        }),
      resetTypeSpec: (category) =>
        set((s) => {
          const active = s.presets.find((p) => p.id === s.activePresetId)
          if (active?.builtin) return {}
          const typeSettings = {
            ...s.typeSettings,
            [category]: { ...defaultTypeSettings()[category] },
          }
          return {
            typeSettings,
            presets: s.presets.map((p) =>
              p.id === s.activePresetId ? { ...p, typeSettings: cloneTypeSettings(typeSettings) } : p
            ),
          }
        }),
      selectPreset: (id) =>
        set((s) => {
          const p = s.presets.find((x) => x.id === id)
          if (!p) return {}
          return {
            activePresetId: id,
            typeSettings: cloneTypeSettings(p.typeSettings),
            output: cloneOutput(p.output),
          }
        }),
      addPreset: (name) => {
        const id = crypto.randomUUID()
        set((s) => {
          // New presets are based on the read-only default preset.
          const base = s.presets.find((p) => p.builtin) ?? s.presets[0]
          return {
            // Prepend so a new preset appears first (leftmost chip / top of list).
            presets: [
              {
                id,
                name: name ?? "",
                output: cloneOutput(base.output),
                typeSettings: cloneTypeSettings(base.typeSettings),
              },
              ...s.presets,
            ],
            activePresetId: id,
            typeSettings: cloneTypeSettings(base.typeSettings),
            output: cloneOutput(base.output),
          }
        })
        return id
      },
      removePreset: (id) =>
        set((s) => {
          const target = s.presets.find((p) => p.id === id)
          if (!target || target.builtin) return {} // can't delete the default
          // Always keep at least one editable user preset in the workspace.
          if (s.presets.filter((p) => !p.builtin).length <= 1) return {}
          const presets = s.presets.filter((p) => p.id !== id)
          if (s.activePresetId !== id) return { presets }
          const next = presets.find((p) => !p.builtin)!
          return {
            presets,
            activePresetId: next.id,
            typeSettings: cloneTypeSettings(next.typeSettings),
            output: cloneOutput(next.output),
          }
        }),
      renamePreset: (id, name) =>
        set((s) => ({
          presets: s.presets.map((p) => (p.id === id ? { ...p, name } : p)),
        })),
      reorderPresets: (fromId, toId) =>
        set((s) => {
          if (fromId === toId) return {}
          const arr = [...s.presets]
          const from = arr.findIndex((p) => p.id === fromId)
          const to = arr.findIndex((p) => p.id === toId)
          if (from < 0 || to < 0) return {}
          const [moved] = arr.splice(from, 1)
          arr.splice(to, 0, moved)
          return { presets: arr }
        }),
      resetPreset: (id) =>
        set((s) => {
          const target = s.presets.find((p) => p.id === id)
          if (!target) return {}
          // The default resets to factory; user presets reset to the default.
          const base = target.builtin
            ? { typeSettings: defaultTypeSettings(), output: { ...DEFAULT_OUTPUT } }
            : (s.presets.find((p) => p.builtin) ?? s.presets[0])
          const typeSettings = cloneTypeSettings(base.typeSettings)
          const output = cloneOutput(base.output)
          const presets = s.presets.map((p) =>
            p.id === id ? { ...p, typeSettings, output } : p
          )
          return s.activePresetId === id
            ? { presets, typeSettings: cloneTypeSettings(typeSettings), output: cloneOutput(output) }
            : { presets }
        }),
      setOutput: (patch) =>
        set((s) => {
          const active = s.presets.find((p) => p.id === s.activePresetId)
          if (active?.builtin) return {} // read-only default — edit it in Settings
          const output = { ...s.output, ...patch }
          return {
            output,
            presets: s.presets.map((p) =>
              p.id === s.activePresetId ? { ...p, output: cloneOutput(output) } : p
            ),
          }
        }),
      editPresetSpec: (id, category, patch) =>
        set((s) => {
          const presets = s.presets.map((p) =>
            p.id === id
              ? {
                  ...p,
                  typeSettings: {
                    ...p.typeSettings,
                    [category]: { ...p.typeSettings[category], ...patch },
                  },
                }
              : p
          )
          if (id !== s.activePresetId) return { presets }
          return {
            presets,
            typeSettings: {
              ...s.typeSettings,
              [category]: { ...s.typeSettings[category], ...patch },
            },
          }
        }),
      editPresetOutput: (id, patch) =>
        set((s) => {
          const presets = s.presets.map((p) =>
            p.id === id ? { ...p, output: { ...p.output, ...patch } } : p
          )
          if (id !== s.activePresetId) return { presets }
          return { presets, output: { ...s.output, ...patch } }
        }),
      setWatchPreset: (watchPresetId) => set({ watchPresetId }),
      setPref: (patch) => set((s) => ({ prefs: { ...s.prefs, ...patch } })),
    }),
    {
      name: "formatif",
      version: 3,
      // One-time: the previous auto-default file name becomes the new default.
      migrate: (persisted, version) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const p = persisted as any
        if (p && version < 3) {
          const fix = (tpl?: string) =>
            tpl === "{input}_compressed" ? "{input}_{quality}" : tpl
          if (p.output) p.output.nameTemplate = fix(p.output.nameTemplate)
          if (Array.isArray(p.presets)) {
            for (const pr of p.presets) {
              if (pr.output) pr.output.nameTemplate = fix(pr.output.nameTemplate)
            }
          }
        }
        return p
      },
      // Deep-merge so newly added fields get defaults even for older state.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsStore>
        const migrateTemplate = (tpl?: string) =>
          (tpl ?? "").replace(/\(input\)/g, "{input}").replace(/\(quality\)/g, "{quality}")
        // Legacy global output (before output moved into presets) becomes each
        // preset's output when the preset doesn't carry its own yet.
        const legacyOutput: OutputConfig = {
          ...DEFAULT_OUTPUT,
          ...(p.output ?? {}),
          nameTemplate:
            migrateTemplate(p.output?.nameTemplate) || DEFAULT_OUTPUT.nameTemplate,
        }
        // Restore + migrate presets (resolution/format, name template, output).
        let presets =
          Array.isArray(p.presets) && p.presets.length ? p.presets : current.presets
        presets = presets.map((pr) => ({
          ...pr,
          typeSettings: migrateTypeSettings(pr.typeSettings),
          output: pr.output
            ? {
                ...pr.output,
                nameTemplate:
                  migrateTemplate(pr.output.nameTemplate) || pr.output.nameTemplate,
              }
            : cloneOutput(legacyOutput),
        }))
        // Always keep a read-only built-in default…
        if (!presets.some((pr) => pr.builtin)) {
          presets = [current.presets[0], ...presets]
        }
        // …and always keep at least one editable user preset.
        if (!presets.some((pr) => !pr.builtin)) {
          const def = presets.find((pr) => pr.builtin)!
          presets = [
            ...presets,
            {
              id: "unnamed",
              name: "",
              output: cloneOutput(def.output),
              typeSettings: cloneTypeSettings(def.typeSettings),
            },
          ]
        }
        // The workspace's active preset must exist and must be editable (never
        // the read-only default — that's selected only via Settings/dropdowns).
        const firstUser = presets.find((pr) => !pr.builtin)!
        const activePresetId =
          p.activePresetId &&
          presets.some((pr) => pr.id === p.activePresetId && !pr.builtin)
            ? (p.activePresetId as string)
            : firstUser.id
        const active = presets.find((pr) => pr.id === activePresetId)!
        const watchPresetId = presets.some((pr) => pr.id === p.watchPresetId)
          ? (p.watchPresetId as string)
          : (presets.find((pr) => pr.builtin)?.id ?? firstUser.id)
        return {
          ...current,
          ...p,
          typeSettings: cloneTypeSettings(active.typeSettings),
          output: cloneOutput(active.output),
          prefs: { ...current.prefs, ...(p.prefs ?? {}) },
          folderTypes: { ...current.folderTypes, ...(p.folderTypes ?? {}) },
          presets,
          activePresetId,
          watchPresetId,
        }
      },
    }
  )
)

// ============================== app (ephemeral) ==============================

interface AppStore {
  view: AppView
  settingsSection: SettingsSection
  files: FileItem[]
  running: boolean
  runStartMs: number
  runSummary?: RunSummary
  tools: ToolStatus[]
  toolsLoaded: boolean
  filePanelId: string | null

  setView: (view: AppView) => void
  setSettingsSection: (section: SettingsSection) => void

  addFiles: (items: FileItem[]) => {
    added: number
    reset: number
    duplicate: number
  }
  removeFile: (id: string) => void
  clearAll: () => void
  updateFile: (id: string, patch: Partial<FileItem>) => void
  setThumbnail: (id: string, thumbnail: string) => void
  setOverride: (id: string, override: CompressionSpec | undefined) => void
  openFilePanel: (id: string) => void
  closeFilePanel: () => void

  startRun: () => void
  finishRun: (summary: RunSummary) => void

  applyTools: (tools: ToolStatus[]) => void
  updateTool: (id: string, patch: Partial<ToolStatus>) => void
}

export const useAppStore = create<AppStore>()((set, get) => ({
  view: "app",
  settingsSection: "general",
  files: [],
  running: false,
  runStartMs: 0,
  runSummary: undefined,
  tools: [],
  toolsLoaded: false,
  filePanelId: null,

  setView: (view) => set({ view }),
  setSettingsSection: (settingsSection) => set({ settingsSection }),

  addFiles: (items) => {
    const byPath = new Map(get().files.map((f) => [f.path, f]))
    const fresh: FileItem[] = []
    const resetIds = new Set<string>()
    let duplicate = 0
    for (const it of items) {
      const existing = byPath.get(it.path)
      if (!existing) {
        fresh.push(it)
      } else if (
        existing.status === "done" ||
        existing.status === "error" ||
        existing.status === "canceled"
      ) {
        // Re-dropping a finished file resets it so it can be re-compressed.
        resetIds.add(existing.id)
      } else {
        duplicate++
      }
    }
    const added = fresh.length
    const reset = resetIds.size
    if (added || reset) {
      set((s) => ({
        files: s.files
          .map((f) =>
            resetIds.has(f.id)
              ? {
                  ...f,
                  status: "ready" as const,
                  percent: 0,
                  result: undefined,
                  error: undefined,
                }
              : f
          )
          .concat(fresh),
        runSummary: undefined,
      }))
    }
    return { added, reset, duplicate }
  },
  removeFile: (id) => set((s) => ({ files: s.files.filter((f) => f.id !== id) })),
  clearAll: () => set({ files: [], runSummary: undefined }),
  updateFile: (id, patch) =>
    set((s) => ({
      files: s.files.map((f) => (f.id === id ? { ...f, ...patch } : f)),
    })),
  setThumbnail: (id, thumbnail) =>
    set((s) => ({
      files: s.files.map((f) => (f.id === id ? { ...f, thumbnail } : f)),
    })),
  setOverride: (id, override) =>
    set((s) => ({
      files: s.files.map((f) => (f.id === id ? { ...f, override } : f)),
    })),
  openFilePanel: (id) => set({ filePanelId: id }),
  closeFilePanel: () => set({ filePanelId: null }),

  startRun: () => set({ running: true, runStartMs: Date.now(), runSummary: undefined }),
  finishRun: (runSummary) => set({ running: false, runSummary }),

  applyTools: (tools) => set({ tools, toolsLoaded: true }),
  updateTool: (id, patch) =>
    set((s) => ({
      tools: s.tools.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),
}))
