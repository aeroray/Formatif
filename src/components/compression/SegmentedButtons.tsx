import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface SegOption {
  value: string
  label: string
}

/** A wrapping single-select control used for Quality / Resolution / Format. */
export function SegmentedButtons({
  options,
  value,
  onChange,
  className,
}: {
  options: SegOption[]
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <Button
            key={opt.value}
            variant="ghost"
            size="segment"
            onClick={() => onChange(opt.value)}
            className={cn(
              "focus-visible:ring-ring/60 focus-visible:ring-2",
              active
                ? "bg-accent text-accent-foreground ring-border ring-1"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary/60 bg-secondary/30"
            )}
          >
            {opt.label}
          </Button>
        )
      })}
    </div>
  )
}
