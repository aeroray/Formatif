// Decode formats ffmpeg can't read (HEIC/HEIF/SVG/PSD) in the webview, producing
// PNG bytes that are then written to a temp file and compressed normally.
// HEIC/HEIF use heic2any (libheif compiled to WASM); SVG uses the webview's
// native renderer via a canvas; PSD uses ag-psd (its flattened composite).

import { readDataUrl } from "@/lib/tauri"

const DECODE_EXTS = new Set(["heic", "heif", "svg", "psd"])

export function needsDecode(ext: string): boolean {
  return DECODE_EXTS.has(ext.toLowerCase())
}

export async function decodeToPng(path: string, ext: string): Promise<Uint8Array> {
  const e = ext.toLowerCase()
  if (e === "svg") return svgToPng(path)
  if (e === "psd") return psdToPng(path)
  return heicToPng(path)
}

async function psdToPng(path: string): Promise<Uint8Array> {
  const { readPsd } = await import("ag-psd")
  const dataUrl = await readDataUrl(path)
  const buf = await (await fetch(dataUrl)).arrayBuffer()
  // We only need the flattened composite, so skip the per-layer pixel data.
  const psd = readPsd(buf, { skipLayerImageData: true, skipThumbnail: true })
  const canvas = psd.canvas
  if (!canvas) throw new Error("psd has no composite image")
  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b as Blob), "image/png")
  )
  return new Uint8Array(await blob.arrayBuffer())
}

async function heicToPng(path: string): Promise<Uint8Array> {
  const { default: heic2any } = await import("heic2any")
  const dataUrl = await readDataUrl(path)
  const blob = await (await fetch(dataUrl)).blob()
  const out = await heic2any({ blob, toType: "image/png" })
  const png = (Array.isArray(out) ? out[0] : out) as Blob
  return new Uint8Array(await png.arrayBuffer())
}

async function svgToPng(path: string): Promise<Uint8Array> {
  const dataUrl = await readDataUrl(path)
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error("svg load failed"))
    img.src = dataUrl
  })
  let w = img.naturalWidth || 0
  let h = img.naturalHeight || 0
  if (!w || !h) {
    w = 1024
    h = 1024
  }
  const max = 2048
  if (w > max || h > max) {
    const r = Math.min(max / w, max / h)
    w = Math.round(w * r)
    h = Math.round(h * r)
  }
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("no canvas context")
  ctx.drawImage(img, 0, 0, w, h)
  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b as Blob), "image/png")
  )
  return new Uint8Array(await blob.arrayBuffer())
}
