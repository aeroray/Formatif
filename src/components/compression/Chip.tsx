import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** A toggleable pill. Off shows "+ label"; on shows a filled "label". */
export function Chip({
  active,
  onToggle,
  label,
}: {
  active: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <Button
      variant="ghost"
      size="chip"
      onClick={onToggle}
      className={cn(
        "focus-visible:ring-ring/60 focus-visible:ring-2",
        active
          ? "bg-primary/15 text-foreground ring-primary/30 ring-1"
          : "text-muted-foreground hover:text-foreground bg-secondary/40 hover:bg-secondary/70"
      )}
    >
      {!active && <Plus className="size-3" />}
      {label}
    </Button>
  )
}
