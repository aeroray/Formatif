import { useAppStore } from "@/store/store"
import { FileCard } from "./FileCard"
import { AddMoreTile } from "./AddMoreTile"

export function FileGrid({ onBrowse }: { onBrowse: () => void }) {
  const files = useAppStore((s) => s.files)
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <AddMoreTile onBrowse={onBrowse} />
      {files.map((f) => (
        <FileCard key={f.id} file={f} />
      ))}
    </div>
  )
}
