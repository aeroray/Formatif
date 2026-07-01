import type { ReactNode } from "react"

export function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="bg-card/60 rounded-xl border p-4 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export function Row({
  label,
  desc,
  children,
}: {
  label: string
  desc?: string
  children?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {desc && <div className="text-muted-foreground mt-0.5 text-xs">{desc}</div>}
      </div>
      {children && <div className="shrink-0">{children}</div>}
    </div>
  )
}
