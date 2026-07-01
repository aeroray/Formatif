import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n"

export function AddMoreTile({ onBrowse }: { onBrowse: () => void }) {
  const t = useT()
  return (
    <Button
      variant="ghost"
      onClick={onBrowse}
      className="border-primary/45 bg-primary/5 text-primary hover:border-primary hover:bg-primary/10 h-auto aspect-square flex-col gap-2.5 rounded-xl border-2 border-dashed p-0 transition-colors"
    >
      <div className="bg-primary/15 flex size-11 items-center justify-center rounded-full">
        <Plus className="size-6" />
      </div>
      <span className="text-sm font-semibold">{t("main.addMore")}</span>
    </Button>
  )
}
