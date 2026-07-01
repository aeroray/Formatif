import {
  type ClipboardEvent,
  type KeyboardEvent,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { createPortal } from "react-dom"
import type { FileItem, TypeSettings } from "@/types"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** Filename-template variables: `id` is the token name (rendered as `{id}`),
 *  `descKey` the i18n key, `color` the text-colour class used both in the field
 *  and the hint. Each MUST be supported by the Rust substitution
 *  (`apply_name_template` in src-tauri/src/commands.rs). */
export const FILENAME_VARS = [
  { id: "input", descKey: "output.varInput", color: "text-emerald-400" },
  { id: "ext", descKey: "output.varExt", color: "text-sky-400" },
  { id: "format", descKey: "output.varFormat", color: "text-violet-400" },
  { id: "quality", descKey: "output.varQuality", color: "text-amber-400" },
  { id: "resolution", descKey: "output.varResolution", color: "text-cyan-400" },
  { id: "folder", descKey: "output.varFolder", color: "text-orange-400" },
  { id: "date", descKey: "output.varDate", color: "text-rose-400" },
  { id: "time", descKey: "output.varTime", color: "text-indigo-300" },
] as const

const COLOR: Record<string, string> = Object.fromEntries(
  FILENAME_VARS.map((v) => [v.id, v.color])
)
const VAR_IDS = new Set<string>(FILENAME_VARS.map((v) => v.id))
const SPLIT_RE = /(\{[a-z]+\})/g
const TRIGGER_RE = /\{([a-z]*)$/i

const isToken = (p: string) =>
  p.startsWith("{") && p.endsWith("}") && VAR_IDS.has(p.slice(1, -1))

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/** Render the template as HTML with each known token wrapped in a colour span. */
function highlightHtml(value: string): string {
  return value
    .split(SPLIT_RE)
    .map((p) =>
      isToken(p)
        ? `<span class="font-medium ${COLOR[p.slice(1, -1)]}">${esc(p)}</span>`
        : esc(p)
    )
    .join("")
}

// ---- caret helpers (absolute character offset within the editable) ----

function caretOffset(root: HTMLElement): number {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return root.textContent?.length ?? 0
  const range = sel.getRangeAt(0)
  if (!root.contains(range.endContainer)) return root.textContent?.length ?? 0
  const pre = range.cloneRange()
  pre.selectNodeContents(root)
  pre.setEnd(range.endContainer, range.endOffset)
  return pre.toString().length
}

function setCaret(root: HTMLElement, offset: number) {
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let placed = false
  let node: Node | null
  while ((node = walker.nextNode())) {
    const len = node.textContent?.length ?? 0
    if (remaining <= len) {
      range.setStart(node, remaining)
      placed = true
      break
    }
    remaining -= len
  }
  if (!placed) {
    range.selectNodeContents(root)
    range.collapse(false)
  } else {
    range.collapse(true)
  }
  sel.removeAllRanges()
  sel.addRange(range)
}

// ---- example builder (shared with OutputCard) ----

/** Human label for the `{resolution}` token — mirrors the Rust resolution_label. */
export function resolutionLabel(resolution: string): string {
  switch (resolution) {
    case "1":
      return "100%"
    case "0.75":
      return "75%"
    case "0.5":
      return "50%"
    case "0.25":
      return "25%"
    default:
      return resolution
  }
}

function folderName(path: string): string {
  const norm = path.replace(/[\\/]+$/, "")
  const slash = Math.max(norm.lastIndexOf("/"), norm.lastIndexOf("\\"))
  if (slash < 0) return ""
  const dir = norm.slice(0, slash)
  const s2 = Math.max(dir.lastIndexOf("/"), dir.lastIndexOf("\\"))
  return s2 >= 0 ? dir.slice(s2 + 1) : dir
}

/** A concrete example of what the current template resolves to, using the first
 *  queued file when available, otherwise illustrative placeholder values. */
export function buildFilenameExample(
  template: string,
  files: FileItem[],
  typeSettings: TypeSettings
): string {
  if (!template.trim()) return ""
  const f = files[0]
  let ctx: {
    input: string
    ext: string
    format: string
    quality: string
    resolution: string
    folder: string
    outExt: string
  }
  if (f) {
    const spec = f.override ?? typeSettings[f.category]
    const fmt = spec.format === "original" ? f.ext : spec.format
    const outExt = fmt === "jpeg" ? "jpg" : fmt
    ctx = {
      input: f.stem,
      ext: f.ext,
      format: outExt,
      quality: spec.quality,
      resolution: resolutionLabel(spec.resolution),
      folder: folderName(f.path),
      outExt,
    }
  } else {
    ctx = {
      input: "photo",
      ext: "png",
      format: "webp",
      quality: "balanced",
      resolution: "50%",
      folder: "Pictures",
      outExt: "jpg",
    }
  }
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  const base = template
    .replace(/\{input\}/g, ctx.input)
    .replace(/\(input\)/g, ctx.input)
    .replace(/\{ext\}/g, ctx.ext)
    .replace(/\{format\}/g, ctx.format)
    .replace(/\{quality\}/g, ctx.quality)
    .replace(/\(quality\)/g, ctx.quality)
    .replace(/\{resolution\}/g, ctx.resolution)
    .replace(/\{folder\}/g, ctx.folder)
    .replace(/\{date\}/g, date)
    .replace(/\{time\}/g, time)
    .replace(/[/\\:]/g, "_")
  return base ? `${base}.${ctx.outExt}` : ""
}

const INPUT_CLS = cn(
  "border-input dark:bg-input/30 flex h-9 w-full min-w-0 items-center overflow-x-auto rounded-md border bg-transparent px-3 font-mono text-xs whitespace-pre shadow-xs outline-none transition-[color,box-shadow]",
  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
  "no-scrollbar ce-filename cursor-text"
)

export function FilenameInput({
  value,
  onChange,
  example,
}: {
  value: string
  onChange: (v: string) => void
  example?: string
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const lastEmitted = useRef<string | null>(null)
  const composing = useRef(false) // IME composition in progress (CJK input)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  // Anchor rect for the portaled suggestion list (portaled so it escapes the
  // sidebar's ScrollArea clipping + the sibling cards' blur stacking contexts).
  const [coords, setCoords] = useState<{ left: number; top: number; width: number } | null>(
    null
  )

  const matches = open
    ? FILENAME_VARS.filter((v) => v.id.startsWith(query.toLowerCase()))
    : []

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null)
      return
    }
    const update = () => {
      const r = ref.current?.getBoundingClientRect()
      if (r) setCoords({ left: r.left, top: r.bottom + 4, width: r.width })
    }
    update()
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
    }
  }, [open])

  // Sync the DOM only when `value` changed from OUTSIDE this component (reset,
  // migration, first mount). Self-originated edits set `lastEmitted` so this
  // skips and never clobbers the live caret.
  useLayoutEffect(() => {
    const root = ref.current
    if (!root || value === lastEmitted.current) return
    lastEmitted.current = value
    root.innerHTML = highlightHtml(value)
    if (document.activeElement === root) setCaret(root, value.length)
  }, [value])

  // Apply a self-originated change: update DOM + caret imperatively, mark it
  // emitted, then notify the store.
  const commit = (next: string, caret: number) => {
    const root = ref.current
    if (!root) return
    lastEmitted.current = next
    root.innerHTML = highlightHtml(next)
    setCaret(root, caret)
    onChange(next)
  }

  const detectTrigger = (text: string, caret: number) => {
    const m = text.slice(0, caret).match(TRIGGER_RE)
    if (m) {
      setQuery(m[1])
      setActive(0)
      setOpen(true)
    } else {
      setOpen(false)
    }
  }

  const handleInput = () => {
    // While an IME composition is active, leave the DOM alone so re-highlighting
    // doesn't tear down the half-composed characters — re-sync on compositionend.
    if (composing.current) return
    const root = ref.current
    if (!root) return
    const next = root.textContent ?? ""
    const caret = caretOffset(root)
    commit(next, caret)
    detectTrigger(next, caret)
  }

  const insert = (id: string) => {
    const root = ref.current
    if (!root) return
    const caret = caretOffset(root)
    const start = value.slice(0, caret).lastIndexOf("{")
    if (start < 0) return
    const token = `{${id}}`
    setOpen(false)
    commit(value.slice(0, start) + token + value.slice(caret), start + token.length)
    root.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    // Don't intercept keys while the IME is composing (Enter/arrows pick candidates).
    if (e.nativeEvent.isComposing || composing.current) return
    if (open && matches.length) {
      if (e.key === "ArrowDown") {
        e.preventDefault()
        setActive((a) => (a + 1) % matches.length)
        return
      }
      if (e.key === "ArrowUp") {
        e.preventDefault()
        setActive((a) => (a - 1 + matches.length) % matches.length)
        return
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault()
        insert(matches[active].id)
        return
      }
      if (e.key === "Escape") {
        e.preventDefault()
        setOpen(false)
        return
      }
    }
    if (e.key === "Enter") e.preventDefault() // single-line field
  }

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const text = (e.clipboardData.getData("text") || "").replace(/[\r\n]+/g, " ")
    if (!text) return
    const root = ref.current
    if (!root) return
    const caret = caretOffset(root)
    const next = value.slice(0, caret) + text + value.slice(caret)
    commit(next, caret + text.length)
    detectTrigger(next, caret + text.length)
  }

  return (
    <div className="space-y-1">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline={false}
        spellCheck={false}
        data-ph="{input}_compressed"
        onInput={handleInput}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
          handleInput()
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        className={INPUT_CLS}
      />
      {open &&
        matches.length > 0 &&
        coords &&
        createPortal(
          <ul
            role="listbox"
            style={{
              position: "fixed",
              left: coords.left,
              top: coords.top,
              width: coords.width,
            }}
            className="bg-popover text-popover-foreground z-[100] overflow-hidden rounded-md border p-1 shadow-md"
          >
            {matches.map((v, i) => (
              <li key={v.id}>
                <Button
                  variant="ghost"
                  size="xs"
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    insert(v.id)
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "h-auto w-full justify-between gap-3 rounded-sm px-2 py-1 text-left font-normal",
                    i === active && "bg-accent text-accent-foreground"
                  )}
                >
                  <span className={cn("font-mono font-medium", COLOR[v.id])}>
                    {`{${v.id}}`}
                  </span>
                  <span className="text-muted-foreground truncate">{t(v.descKey)}</span>
                </Button>
              </li>
            ))}
          </ul>,
          document.body
        )}
      {example && (
        <p className="text-muted-foreground truncate px-0.5 text-[11px]" title={example}>
          <span className="opacity-70">{t("output.example")}: </span>
          <span className="font-mono">{example}</span>
        </p>
      )}
    </div>
  )
}
