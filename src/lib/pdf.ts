// Render PDF pages to images in the webview (for thumbnails + before/after
// comparison) — ffmpeg can't read PDFs, so we use pdf.js (already a dep).
// We also compress image/scanned PDFs by rasterising + rebuilding (pdf-lib),
// since qpdf can only do lossless structural optimisation (no downsampling).

import { PDFDocument } from "pdf-lib"
import { readDataUrl } from "@/lib/tauri"

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null
async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import("pdfjs-dist")
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjs
    })()
  }
  return pdfjsPromise
}

/** Render the first page of PDF bytes to a JPEG `data:` URL, fit within `maxPx`. */
export async function pdfBytesToDataUrl(bytes: Uint8Array, maxPx = 256): Promise<string> {
  const pdfjs = await getPdfjs()
  const task = pdfjs.getDocument({ data: bytes })
  try {
    const doc = await task.promise
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const scale = Math.min(maxPx / base.width, maxPx / base.height, 4)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement("canvas")
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("no canvas context")
    ctx.fillStyle = "#fff" // PDFs are transparent; flatten onto white
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    return canvas.toDataURL("image/jpeg", 0.82)
  } finally {
    task.destroy()
  }
}

/** Render the first page of a PDF file (by path) to a JPEG `data:` URL. */
export async function pdfPageDataUrl(path: string, maxPx = 256): Promise<string> {
  const dataUrl = await readDataUrl(path)
  const bytes = new Uint8Array(await (await fetch(dataUrl)).arrayBuffer())
  return pdfBytesToDataUrl(bytes, maxPx)
}

// Per-quality rasterisation settings: image DPI + JPEG quality.
const PDF_QUALITY: Record<string, { dpi: number; jpeg: number }> = {
  high: { dpi: 180, jpeg: 0.82 },
  balanced: { dpi: 144, jpeg: 0.68 },
  medium: { dpi: 120, jpeg: 0.5 },
  low: { dpi: 100, jpeg: 0.42 },
}

async function canvasJpeg(canvas: HTMLCanvasElement, q: number): Promise<Uint8Array> {
  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b as Blob), "image/jpeg", q)
  )
  return new Uint8Array(await blob.arrayBuffer())
}

/** Compress a PDF by rasterising every page to a downsampled JPEG and rebuilding
 *  the document. Lossy (no text layer) but shrinks image/scanned PDFs; callers
 *  should keep the original when this isn't actually smaller. */
export async function compressPdfBytes(
  bytes: Uint8Array,
  quality: string
): Promise<Uint8Array> {
  const opt = PDF_QUALITY[quality] ?? PDF_QUALITY.balanced
  const pdfjs = await getPdfjs()
  const task = pdfjs.getDocument({ data: bytes })
  const out = await PDFDocument.create()
  try {
    const doc = await task.promise
    const scale = opt.dpi / 72
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const ptSize = page.getViewport({ scale: 1 }) // page size in PDF points
      const vp = page.getViewport({ scale })
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.ceil(vp.width))
      canvas.height = Math.max(1, Math.ceil(vp.height))
      const ctx = canvas.getContext("2d")
      if (!ctx) throw new Error("no canvas context")
      ctx.fillStyle = "#fff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise
      const jpg = await out.embedJpg(await canvasJpeg(canvas, opt.jpeg))
      const p = out.addPage([ptSize.width, ptSize.height])
      p.drawImage(jpg, { x: 0, y: 0, width: ptSize.width, height: ptSize.height })
    }
    return await out.save()
  } finally {
    task.destroy()
  }
}

export async function compressPdf(path: string, quality: string): Promise<Uint8Array> {
  const dataUrl = await readDataUrl(path)
  const bytes = new Uint8Array(await (await fetch(dataUrl)).arrayBuffer())
  return compressPdfBytes(bytes, quality)
}
