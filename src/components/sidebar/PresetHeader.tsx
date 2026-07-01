import { useEffect, useRef, useState } from "react"
import {
  Check,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react"
import type { Preset } from "@/types"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useSettingsStore } from "@/store/store"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const NAME_MAX = 10

/** Preset selector: quick-select chips + a management panel (add, drag to
 *  reorder, and a per-row ⋯ menu for rename / reset / delete). */
export function PresetHeader() {
  const presets = useSettingsStore((s) => s.presets)
  const activePresetId = useSettingsStore((s) => s.activePresetId)
  const selectPreset = useSettingsStore((s) => s.selectPreset)
  const addPreset = useSettingsStore((s) => s.addPreset)
  const removePreset = useSettingsStore((s) => s.removePreset)
  const renamePreset = useSettingsStore((s) => s.renamePreset)
  const reorderPresets = useSettingsStore((s) => s.reorderPresets)
  const resetPreset = useSettingsStore((s) => s.resetPreset)
  const t = useT()

  // The read-only "Default preset" is edited only in Settings — hide it here.
  const userPresets = presets.filter((p) => !p.builtin)

  const [menuOpen, setMenuOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const overIdRef = useRef<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const setOver = (id: string | null) => {
    overIdRef.current = id
    setOverId(id)
  }

  // Edge fades for the (horizontally scrollable) chip row.
  const chipsRef = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState({ left: false, right: false })
  const updateFade = () => {
    const el = chipsRef.current
    if (!el) return
    setFade({
      left: el.scrollLeft > 1,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
    })
  }
  useEffect(updateFade, [presets.length])

  // Translate vertical mouse-wheel into horizontal scroll over the chip row.
  useEffect(() => {
    const el = chipsRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0 || el.scrollWidth <= el.clientWidth) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [])

  // Pointer-based drag to reorder presets. (HTML5 drag-and-drop is swallowed by
  // Tauri's native file drag-drop, so we track the pointer ourselves.)
  useEffect(() => {
    if (!dragId) return
    const onMove = (e: PointerEvent) => {
      const list = listRef.current
      if (!list) return
      const rows = Array.from(list.querySelectorAll<HTMLElement>("[data-preset-row]"))
      let target: string | null = null
      for (const row of rows) {
        const r = row.getBoundingClientRect()
        if (e.clientY >= r.top && e.clientY <= r.bottom) {
          target = row.dataset.presetRow ?? null
          break
        }
      }
      if (!target && rows.length) {
        const aboveFirst = e.clientY < rows[0].getBoundingClientRect().top
        const edge = aboveFirst ? rows[0] : rows[rows.length - 1]
        target = edge.dataset.presetRow ?? null
      }
      if (target && target !== overIdRef.current) setOver(target)
    }
    const onUp = () => {
      const from = dragId
      const to = overIdRef.current
      if (from && to && from !== to) reorderPresets(from, to)
      setDragId(null)
      setOver(null)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    // Suppress text selection for the duration of the drag.
    const prevUserSelect = document.body.style.userSelect
    document.body.style.userSelect = "none"
    return () => {
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      document.body.style.userSelect = prevUserSelect
    }
  }, [dragId, reorderPresets])

  const label = (p: Preset) =>
    p.builtin ? t("preset.default") : p.name || t("preset.untitled")

  const startEdit = (p: Preset) => {
    setEditValue(p.name)
    setEditingId(p.id)
  }
  const commitEdit = () => {
    if (!editingId) return
    const v = editValue.trim().slice(0, NAME_MAX)
    const p = presets.find((x) => x.id === editingId)
    // Empty name: discard a brand-new (never-named) preset; keep an existing one.
    if (!v) {
      if (p && !p.builtin && !p.name) removePreset(editingId)
      setEditingId(null)
      return
    }
    renamePreset(editingId, v)
    setEditingId(null)
  }
  // Escape cancels: also drops a just-added preset that was never named.
  const cancelEdit = () => {
    const p = editingId ? presets.find((x) => x.id === editingId) : null
    if (p && !p.builtin && !p.name) removePreset(p.id)
    setEditingId(null)
  }

  // Close the management panel on outside click — but not when clicking inside
  // a (portaled) dropdown menu. Also discard a just-added, never-named preset.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (wrapRef.current?.contains(target)) return
      if (target.closest?.('[data-slot="dropdown-menu-content"]')) return
      const p = editingId ? presets.find((x) => x.id === editingId) : null
      if (p && !p.builtin && !p.name) removePreset(p.id)
      setMenuOpen(false)
      setEditingId(null)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [menuOpen, editingId, presets, removePreset])

  return (
    <div className="flex items-center gap-2 px-1">
      <div ref={wrapRef} className="relative flex h-7 shrink-0 items-center">
        <Button
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          aria-label={t("preset.manage")}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <MoreHorizontal className="size-4" />
        </Button>

        {menuOpen && (
          <div
            ref={listRef}
            className="bg-popover absolute top-9 left-0 z-50 max-h-[60vh] w-64 overflow-y-auto rounded-lg border p-1 shadow-xl"
          >
            <Button
              variant="ghost"
              onClick={() => {
                const id = addPreset()
                setEditValue("")
                setEditingId(id)
              }}
              className="w-full justify-start gap-2 px-2"
            >
              <Plus className="size-4" />
              {t("preset.add")}
            </Button>

            <div className="bg-border my-1 h-px" />

            {userPresets.map((p) => (
              <div
                key={p.id}
                data-preset-row={p.id}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
                  dragId === p.id && "opacity-40",
                  overId === p.id && dragId !== p.id
                    ? "bg-primary/15"
                    : "hover:bg-secondary/60"
                )}
              >
                <GripVertical
                  onPointerDown={(e) => {
                    if (editingId === p.id) return
                    e.preventDefault()
                    setDragId(p.id)
                    setOver(p.id)
                  }}
                  className="text-muted-foreground size-4 shrink-0 cursor-grab touch-none active:cursor-grabbing"
                />

                {editingId === p.id ? (
                  <>
                    <input
                      autoFocus
                      value={editValue}
                      maxLength={NAME_MAX}
                      placeholder={t("preset.namePlaceholder")}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={commitEdit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit()
                        if (e.key === "Escape") cancelEdit()
                      }}
                      className="ring-primary bg-background h-6 min-w-0 flex-1 rounded px-1.5 text-sm ring-1 outline-none"
                    />
                    <Button
                      size="icon-xs"
                      aria-label={t("a11y.confirm")}
                      title={t("a11y.confirm")}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={commitEdit}
                      className="shrink-0"
                    >
                      <Check className="size-3.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate text-sm">{label(p)}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={t("preset.manage")}
                          className="text-muted-foreground hover:text-foreground shrink-0"
                        >
                          <MoreHorizontal className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {!p.builtin && (
                          <DropdownMenuItem onClick={() => startEdit(p)}>
                            <Pencil className="size-3.5" />
                            {t("preset.rename")}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => resetPreset(p.id)}>
                          <RotateCcw className="size-3.5" />
                          {t("preset.reset")}
                        </DropdownMenuItem>
                        {!p.builtin && (
                          <DropdownMenuItem
                            variant="destructive"
                            disabled={userPresets.length <= 1}
                            onClick={() => removePreset(p.id)}
                          >
                            <Trash2 className="size-3.5" />
                            {t("preset.delete")}
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* quick-select chips: scroll horizontally (no scrollbar) with edge fades */}
      <div
        ref={chipsRef}
        onScroll={updateFade}
        className="no-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5"
        style={{
          WebkitMaskImage: `linear-gradient(to right, transparent, #000 ${
            fade.left ? "18px" : "0"
          }, #000 calc(100% - ${fade.right ? "18px" : "0px"}), transparent)`,
          maskImage: `linear-gradient(to right, transparent, #000 ${
            fade.left ? "18px" : "0"
          }, #000 calc(100% - ${fade.right ? "18px" : "0px"}), transparent)`,
        }}
      >
        {userPresets.map((p) => (
          <Button
            key={p.id}
            variant="secondary"
            size="xs"
            onClick={() => selectPreset(p.id)}
            className={cn(
              "max-w-[140px] min-w-0 shrink-0",
              p.id === activePresetId
                ? "border-primary/50 bg-primary/15 text-foreground hover:bg-primary/20"
                : "border-border text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            )}
          >
            <span className="truncate">{label(p)}</span>
          </Button>
        ))}
      </div>
    </div>
  )
}
