import { useEffect, useState } from "react"
import { toast } from "sonner"
import { ZoomIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Logo } from "@/components/Logo"
import { getAppVersion } from "@/lib/tauri"
import { useT } from "@/lib/i18n"
import { Section } from "../parts"

type QrId = "wechat" | "alipay"

const QR_CODES: { id: QrId; src: string; accent: string; labelKey: "prefs.wechat" | "prefs.alipay" }[] = [
  { id: "wechat", src: "/wechat.jpg", accent: "#2AAD3F", labelKey: "prefs.wechat" },
  { id: "alipay", src: "/alipay.jpg", accent: "#1677FF", labelKey: "prefs.alipay" },
]

export function AboutPanel() {
  const [version, setVersion] = useState("")
  const [openQr, setOpenQr] = useState<QrId | null>(null)
  const t = useT()

  useEffect(() => {
    getAppVersion()
      .then(setVersion)
      .catch(() => {})
  }, [])

  const open = QR_CODES.find((q) => q.id === openQr)

  return (
    <>
      <Section title={t("prefs.about")}>
        <div className="flex items-center gap-3">
          <Logo className="size-11 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{t("app.name")}</div>
            <div className="text-muted-foreground text-xs">
              {t("prefs.version")} {version}
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => toast.message(t("prefs.comingSoon"))}
          >
            {t("prefs.softwareUpdate")}
          </Button>
        </div>
      </Section>

      <Section title={t("prefs.support")}>
        <p className="text-muted-foreground -mt-2 text-xs">{t("prefs.supportDesc")}</p>
        <div className="grid grid-cols-2 gap-3">
          {QR_CODES.map((qr) => (
            <QrCard key={qr.id} qr={qr} label={t(qr.labelKey)} onOpen={() => setOpenQr(qr.id)} />
          ))}
        </div>
      </Section>

      <Dialog open={open != null} onOpenChange={(o) => !o && setOpenQr(null)}>
        <DialogContent className="w-auto max-w-none gap-3 p-5">
          <DialogTitle className="text-center text-sm">
            {open && t(open.labelKey)}
          </DialogTitle>
          {open && (
            <img src={open.src} alt="" className="size-72 rounded-lg object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function QrCard({
  qr,
  label,
  onOpen,
}: {
  qr: { src: string; accent: string }
  label: string
  onOpen: () => void
}) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors hover:bg-secondary/40"
    >
      <div className="relative overflow-hidden rounded-lg">
        <img src={qr.src} alt={label} className="size-28 object-cover" />
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          <ZoomIn className="size-5 text-white" />
        </div>
      </div>
      <span className="flex items-center gap-1.5 text-sm font-medium">
        <span className="size-2 rounded-full" style={{ backgroundColor: qr.accent }} />
        {label}
      </span>
      <span className="text-muted-foreground text-[11px]">{t("prefs.tapToEnlarge")}</span>
    </button>
  )
}
