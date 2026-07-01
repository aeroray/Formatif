import { useEffect, useState } from "react"
import { getCurrentWebview } from "@tauri-apps/api/webview"
import { isTauri } from "@/lib/tauri"

// A single, app-wide drag-drop listener. Registering per-component made React
// StrictMode (and HMR) attach multiple listeners, so one drop fired `ingest`
// several times → repeated "already in list" toasts. Centralizing it here
// guarantees exactly one handler regardless of how many components mount.
let registered = false
let lastDropAt = 0
let dropHandler: ((paths: string[]) => void) | null = null
const draggingSubscribers = new Set<(v: boolean) => void>()

function setDragging(v: boolean) {
  draggingSubscribers.forEach((fn) => fn(v))
}

function ensureListener() {
  if (registered || !isTauri) return
  registered = true
  getCurrentWebview().onDragDropEvent((event) => {
    const p = event.payload
    if (p.type === "enter" || p.type === "over") {
      setDragging(true)
    } else if (p.type === "leave") {
      setDragging(false)
    } else if (p.type === "drop") {
      setDragging(false)
      const now = Date.now()
      if (now - lastDropAt < 700) return // collapse Tauri's double-fire
      lastDropAt = now
      if (p.paths && p.paths.length) dropHandler?.(p.paths)
    }
  })
}

// Reset the singleton across HMR reloads so we don't leak the old listener.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    registered = false
    dropHandler = null
    draggingSubscribers.clear()
  })
}

export function useDragDrop(onPaths: (paths: string[]) => void) {
  const [isDragging, setIsDragging] = useState(false)

  // Always route drops to the latest callback.
  useEffect(() => {
    dropHandler = onPaths
  }, [onPaths])

  useEffect(() => {
    ensureListener()
    draggingSubscribers.add(setIsDragging)
    return () => {
      draggingSubscribers.delete(setIsDragging)
    }
  }, [])

  return { isDragging }
}
