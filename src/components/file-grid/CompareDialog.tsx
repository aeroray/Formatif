import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import type { FileItem } from "@/types"
import { readDataUrl } from "@/lib/tauri"
import { extOf, humanSize } from "@/lib/compress"
import { pdfPageDataUrl } from "@/lib/pdf"
import { useT } from "@/lib/i18n"
import { CompareShell } from "./CompareShell"

export function CompareDialog({
  file,
  onClose,
}: {
  file: FileItem
  onClose: () => void
}) {
  const t = useT()
  const [before, setBefore] = useState<string | null>(null)
  const [after, setAfter] = useState<string | null>(null)
  const [aspect, setAspect] = useState<number>()

  const outSize = file.result?.outputSize ?? 0
  const outExt = file.result ? extOf(file.result.outputPath) : file.ext
  const saved = file.result?.savedPct ?? 0
  const pctText = `${saved >= 0 ? "−" : "+"}${Math.abs(Math.round(saved))}%`

  useEffect(() => {
    let alive = true
    // PDFs aren't <img>-renderable: rasterise the first page via pdf.js instead.
    const load = (path: string) =>
      file.category === "pdf" ? pdfPageDataUrl(path, 1400) : readDataUrl(path)
    load(file.path)
      .then((u) => alive && setBefore(u))
      .catch(() => {})
    if (file.result) {
      load(file.result.outputPath)
        .then((u) => alive && setAfter(u))
        .catch(() => {})
    }
    return () => {
      alive = false
    }
  }, [file])

  const imgClass = "h-full w-full object-contain"

  // While the full-resolution bytes load, show a lightweight loader.
  if (!before || !after) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-3xl gap-3">
          <DialogTitle className="truncate pr-6 text-sm">{file.name}</DialogTitle>
          <div className="flex h-[58vh] items-center justify-center">
            <Loader2 className="text-muted-foreground size-6 animate-spin" />
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <CompareShell
      name={file.name}
      beforeLabel={`${t("compare.before")}: ${file.ext.toUpperCase()} ${humanSize(file.size)}`}
      afterLabel={`${t("compare.after")}: ${outExt.toUpperCase()} ${humanSize(outSize)}, ${pctText}`}
      aspectRatio={aspect}
      itemOne={
        <img
          src={before}
          alt=""
          draggable={false}
          className={imgClass}
          onLoad={(e) =>
            setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)
          }
        />
      }
      itemTwo={<img src={after} alt="" draggable={false} className={imgClass} />}
      onClose={onClose}
    />
  )
}
