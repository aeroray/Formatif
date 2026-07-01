import { useState } from "react"
import { Check, Copy, Download, Info, Loader2, RefreshCw } from "lucide-react"
import { toast } from "sonner"
import type { ToolStatus } from "@/types"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAppStore } from "@/store/store"
import { installTool, isTauri, reinstallTool } from "@/lib/tauri"
import { humanSize } from "@/lib/compress"
import { tx, useT } from "@/lib/i18n"
import { cn, copyText } from "@/lib/utils"
import { Section } from "../parts"

export function ExtensionsPanel() {
  const tools = useAppStore((s) => s.tools)
  const updateTool = useAppStore((s) => s.updateTool)
  const t = useT()

  const run = (id: string, installed: boolean) => {
    updateTool(id, { state: "installing", percent: 0, error: undefined })
    const p = installed ? reinstallTool(id) : installTool(id)
    p.catch(() => {
      updateTool(id, { state: "error" })
      toast.error(tx("toast.toolFailed", { name: id }))
    })
  }

  const reinstallAll = () =>
    tools
      .filter((tool) => !tool.optional)
      .forEach((tool) => run(tool.id, tool.state === "installed"))

  return (
    <Section
      title={t("deps.title")}
      action={
        <Button
          variant="secondary"
          size="sm"
          className="shrink-0 gap-1.5"
          disabled={!isTauri || tools.length === 0}
          onClick={reinstallAll}
        >
          <RefreshCw className="size-3.5" />
          {t("deps.reinstallAll")}
        </Button>
      }
    >
      <p className="text-muted-foreground -mt-2 text-xs">{t("deps.desc")}</p>

      {tools.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("deps.tool")}</TableHead>
                <TableHead>{t("deps.status")}</TableHead>
                <TableHead className="w-24">{t("deps.action")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tools.map((tool) => (
                <ToolRow key={tool.id} tool={tool} onRun={run} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </Section>
  )
}

function ToolRow({
  tool,
  onRun,
}: {
  tool: ToolStatus
  onRun: (id: string, installed: boolean) => void
}) {
  const t = useT()
  const installing = tool.state === "installing"
  const installed = tool.state === "installed"
  const errored = tool.state === "error"
  const pct = tool.percent ?? 0

  const status = installing
    ? `${t("deps.installing")} ${pct}%`
    : installed
      ? `${t("deps.installed")}${tool.sizeBytes ? ` · ${humanSize(tool.sizeBytes)}` : ""}`
      : errored
        ? tool.error || t("deps.failed")
        : t("deps.missing")

  return (
    <TableRow>
      <TableCell>
        <div className="flex min-w-0 items-center gap-2 font-medium">
          <span className="truncate">{tool.name}</span>
          <InfoPopover tool={tool} />
          {tool.optional && (
            <span className="bg-secondary/60 text-muted-foreground rounded px-1.5 py-0.5 text-[10px]">
              {t("deps.optional")}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div
          className={cn(
            "text-xs",
            errored ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {status}
        </div>
        {installing && <Progress value={pct} className="mt-2 h-1.5" />}
      </TableCell>
      <TableCell>
        <Button
          variant={installed ? "secondary" : "default"}
          size="xs"
          className="gap-1.5"
          disabled={installing || !isTauri}
          onClick={() => onRun(tool.id, installed)}
        >
          {installing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : installed ? (
            <RefreshCw className="size-3.5" />
          ) : (
            <Download className="size-3.5" />
          )}
          {installed ? t("deps.reinstall") : t("deps.install")}
        </Button>
      </TableCell>
    </TableRow>
  )
}
function InfoPopover({ tool }: { tool: ToolStatus }) {
  const t = useT()
  return (
    <HoverCard openDelay={120} closeDelay={160}>
      <HoverCardTrigger asChild>
        <span
          tabIndex={0}
          aria-label={t("deps.source")}
          className="text-muted-foreground/50 hover:text-muted-foreground inline-flex cursor-help items-center outline-none"
        >
          <Info className="size-3.5" />
        </span>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="space-y-2.5">
        {tool.url && <InfoRow label={t("deps.source")} value={tool.url} />}
        {tool.installPath && (
          <InfoRow label={t("deps.installLocation")} value={tool.installPath} />
        )}
      </HoverCardContent>
    </HoverCard>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  const onCopy = () => {
    if (copyText(value)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    }
  }
  return (
    <div>
      <div className="text-muted-foreground mb-1 text-[11px] font-medium">{label}</div>
      <div className="flex items-start gap-1.5">
        <span className="bg-secondary/50 flex-1 rounded px-2 py-1 text-xs [overflow-wrap:anywhere]">
          {value}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onCopy}
          aria-label={t("deps.copy")}
          title={copied ? t("deps.copied") : t("deps.copy")}
          className="text-muted-foreground hover:text-foreground hover:bg-secondary size-7 shrink-0 rounded"
        >
          {copied ? (
            <Check className="size-3.5 text-emerald-500" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </Button>
      </div>
    </div>
  )
}
