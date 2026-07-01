import { Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useT } from "@/lib/i18n"

// The dashed border + drag highlight live on the parent canvas (MainScreen);
// this is just the centered, clickable browse target.
export function EmptyDropzone({ onBrowse }: { onBrowse: () => void }) {
  const t = useT()
  return (
    <Button
      variant="ghost"
      onClick={onBrowse}
      className="hover:bg-secondary/15 h-full w-full flex-col rounded-none px-6 text-center transition-colors"
    >
      <div className="relative mb-5 flex size-20 items-center justify-center">
        {/* breathing pulse ring */}
        <span
          className="bg-primary/20 absolute inset-0 rounded-[1.4rem]"
          style={{ animation: "formatif-pulse-ring 2.6s ease-out infinite" }}
        />
        {/* gradient disc with a gently floating arrow */}
        <div className="from-primary/25 to-primary/5 ring-primary/25 relative flex size-16 items-center justify-center rounded-[1.4rem] bg-gradient-to-br ring-1">
          <Upload
            className="text-primary size-7"
            style={{ animation: "formatif-float 2.8s ease-in-out infinite" }}
          />
        </div>
      </div>
      <div className="text-lg font-semibold">{t("main.empty.title")}</div>
      <div className="text-muted-foreground mt-1.5 max-w-xs text-sm">
        {t("main.empty.subtitle")}
      </div>
    </Button>
  )
}
