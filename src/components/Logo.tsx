import { Shrink } from "lucide-react"
import { cn } from "@/lib/utils"

/** The Formatif "compress" mark: inward arrows on a purple squircle. */
export function Logo({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "from-primary flex items-center justify-center rounded-[28%] bg-gradient-to-br to-purple-700 text-white shadow-lg",
        className
      )}
    >
      <Shrink className="size-[55%]" strokeWidth={2.25} />
    </div>
  )
}
