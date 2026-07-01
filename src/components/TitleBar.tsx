import { ArrowLeft, Minus, Settings, Square, X } from "lucide-react"
import { getCurrentWindow } from "@tauri-apps/api/window"
import { Button } from "@/components/ui/button"
import { Logo } from "@/components/Logo"
import { useAppStore } from "@/store/store"
import { useT } from "@/lib/i18n"
import { isTauri } from "@/lib/tauri"
import { cn } from "@/lib/utils"

/** Custom frameless title bar (decorations are off) with a drag region +
 *  integrated window controls. */
export function TitleBar() {
  const view = useAppStore((s) => s.view)
  const setView = useAppStore((s) => s.setView)
  const t = useT()

  const onSettings = view === "settings"
  const onMain = view === "app"

  return (
    <div
      data-tauri-drag-region
      className="relative flex h-10 shrink-0 items-center gap-2 pr-0 pl-2 select-none"
    >
      {/* left */}
      {onSettings ? (
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5"
          onClick={() => setView("app")}
        >
          <ArrowLeft className="size-4" />
          {t("app.back")}
        </Button>
      ) : onMain ? (
        <div className="flex items-center gap-2">
          <Logo className="size-6" />
          <span className="text-sm font-semibold">{t("app.name")}</span>
        </div>
      ) : (
        <span />
      )}

      {/* centered title (settings) */}
      {onSettings && (
        <div className="text-muted-foreground pointer-events-none absolute left-1/2 -translate-x-1/2 text-sm font-medium">
          {t("app.name")} · {t("app.settings")}
        </div>
      )}

      {/* right: contextual actions + window controls */}
      <div className="ml-auto flex items-center">
        {onMain && (
          <div className="mr-1 flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setView("settings")}
              aria-label={t("a11y.settings")}
            >
              <Settings className="size-4" />
            </Button>
          </div>
        )}
        <WindowControls />
      </div>
    </div>
  )
}

function WindowControls() {
  if (!isTauri) return null
  const w = () => getCurrentWindow()
  const base = "text-muted-foreground h-10 w-12 rounded-none"
  return (
    <div className="flex items-center">
      <Button
        variant="ghost"
        aria-label="Minimize"
        className={cn(base, "hover:bg-secondary hover:text-foreground")}
        onClick={() => w().minimize()}
      >
        <Minus className="size-4" />
      </Button>
      <Button
        variant="ghost"
        aria-label="Maximize"
        className={cn(base, "hover:bg-secondary hover:text-foreground")}
        onClick={() => w().toggleMaximize()}
      >
        <Square className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        aria-label="Close"
        className={cn(base, "hover:bg-destructive hover:text-white")}
        onClick={() => w().close()}
      >
        <X className="size-4" />
      </Button>
    </div>
  )
}
