import { useEffect, useRef, useState } from "react"
import type { FileItem } from "@/types"
import { assetSrc } from "@/lib/tauri"
import { canPreviewVideo, extOf, humanSize } from "@/lib/compress"
import { useT } from "@/lib/i18n"
import { CompareShell } from "./CompareShell"

/** Before/after video comparison. Both clips loop muted and are kept frame-
 *  synced (the "after" clip drives the "before" clip) so the reveal aligns. */
export function VideoCompareDialog({
  file,
  onClose,
}: {
  file: FileItem
  onClose: () => void
}) {
  const t = useT()
  const beforeRef = useRef<HTMLVideoElement>(null)
  const afterRef = useRef<HTMLVideoElement>(null)
  const [aspect, setAspect] = useState<number>()
  const [ready, setReady] = useState(0)

  // Drive "before" from "after" every animation frame (≈60Hz) so the two stay
  // tightly in sync — both during playback and across loop wraps.
  useEffect(() => {
    const a = afterRef.current
    const b = beforeRef.current
    if (!a || !b) return
    let raf = 0
    const tick = () => {
      if (Math.abs(a.currentTime - b.currentTime) > 0.05) b.currentTime = a.currentTime
      if (a.paused !== b.paused) {
        if (a.paused) b.pause()
        else void b.play().catch(() => {})
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const onReady = () => setReady((n) => n + 1)

  const outSize = file.result?.outputSize ?? 0
  const outExt = file.result ? extOf(file.result.outputPath) : file.ext
  const saved = file.result?.savedPct ?? 0
  const pct = saved < 0 ? `+${Math.round(-saved)}%` : `−${Math.round(saved)}%`
  const vClass = "h-full w-full object-contain"
  // Either side may be an animated image rather than a video (GIF → mp4, or
  // video → GIF): render <img> for those. Frame-sync only runs video↔video.
  const beforeIsVideo = canPreviewVideo(file.ext)
  const afterIsVideo = canPreviewVideo(outExt)

  return (
    <CompareShell
      name={file.name}
      beforeLabel={`${t("compare.before")}: ${file.ext.toUpperCase()} ${humanSize(file.size)}`}
      afterLabel={`${t("compare.after")}: ${outExt.toUpperCase()} ${humanSize(outSize)}, ${pct}`}
      aspectRatio={aspect}
      loading={ready < 2}
      itemOne={
        beforeIsVideo ? (
          <video
            ref={beforeRef}
            src={assetSrc(file.path)}
            autoPlay
            loop
            muted
            playsInline
            className={vClass}
            onLoadedMetadata={(e) =>
              setAspect(e.currentTarget.videoWidth / e.currentTarget.videoHeight)
            }
            onLoadedData={onReady}
            onError={onReady}
          />
        ) : (
          <img
            src={assetSrc(file.path)}
            alt=""
            draggable={false}
            className={vClass}
            onLoad={(e) => {
              setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)
              onReady()
            }}
            onError={onReady}
          />
        )
      }
      itemTwo={
        afterIsVideo ? (
          <video
            ref={afterRef}
            src={file.result ? assetSrc(file.result.outputPath) : ""}
            autoPlay
            loop
            muted
            playsInline
            className={vClass}
            onLoadedData={onReady}
            onError={onReady}
          />
        ) : (
          <img
            src={file.result ? assetSrc(file.result.outputPath) : ""}
            alt=""
            draggable={false}
            className={vClass}
            onLoad={onReady}
            onError={onReady}
          />
        )
      }
      onClose={onClose}
    />
  )
}
