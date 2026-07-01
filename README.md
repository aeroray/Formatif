

# Formatif

**Free, open-source, and 100% local media compression for Windows.**

Compress images, video, GIFs and PDFs on your own machine — no uploads, no
account, no subscription.

[English](README.md) · [简体中文](README.zh-CN.md)

[License: MIT](LICENSE)
Platform
Built with Tauri



---

Formatif is a lightweight desktop app for **compressing** images, video, GIFs
and PDFs, and converting between common media formats. Everything runs on your
device: no uploads, no account, no network needed for compression.

## Features

- **Free & open source (MIT)** — no license key, no paywall, no telemetry.
- **Tiny installer (~4 MB)** — the heavy tools (ffmpeg, qpdf, gifsicle)
**download on first use** instead of being bundled, so the installer stays
small.
- **Private by design** — files never leave your machine.
- **Batch** — drop files *or whole folders*; compress them all in parallel.
- **Folder monitoring** — watch folders and auto-compress anything dropped
into them.
- **Presets** — a read-only default preset plus your own named presets, with
per-file overrides for one-off exceptions.
- **Before/after compare** — see size and quality side by side for images,
video, GIF and PDF.
- **Dark, focused UI** with 7 accent colors, bilingual (English & 简体中文,
auto-selected from your system language).



## Tech stack

- **Tauri 2** (Rust) shell + **React 19 + TypeScript + Vite** frontend
- **shadcn/ui** (Tailwind v4, Radix) + **zustand**
- External CLI tools, **downloaded on demand** (not bundled): **ffmpeg**
(image/video/gif), **qpdf** (PDF structure), **gifsicle** (GIF lossy
optimization). Managed in Settings → Tools.



## How compression works

Each file belongs to a category — **Image**, **Video**, **GIF** or **PDF** —
with its own settings:


| Setting        | Options                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| Quality        | Original · Balanced · High · Medium · Low                                                                  |
| Resolution     | 100% · 75% · 50% · 25%                                                                                     |
| Format (Image) | Original · JPEG · PNG · WebP · AVIF · ICO                                                                  |
| Format (Video) | Original · MP4 · WebM · MOV · MKV · AVI · WMV · FLV · M4V · 3GP · GIF · MP3 · AAC · WAV · FLAC · OGG · M4A |
| Format (GIF)   | Original · MP4 · WebM · WebP                                                                               |
| PDF            | Always stays a PDF                                                                                         |


- **Image / video** — the Rust backend builds ffmpeg arguments per
(category × format × quality) in `[args.rs](src-tauri/src/args.rs)`.
Progress, cancel and results stream back over `compress://*` events.
- **GIF** — ffmpeg rebuilds the palette (frame rate + colors driven by the
quality preset), then **gifsicle** applies lossy compression on top —
ffmpeg alone can't shrink an already-optimized GIF, gifsicle is what
actually gets the size down.
- **PDF** — losslessly recompressed with **qpdf**. For image-heavy PDFs, an
optional rasterize-and-rebuild pass (pdf.js + pdf-lib, in the webview) can
downsample embedded images further; it's only kept if the result is
smaller than the original.
- Broader **input** support beyond the output formats above: HEIC/HEIF, PSD,
SVG, TIFF, BMP, TGA and JPEG-2000 images decode to PNG before compressing;
common legacy video containers (MPG, TS, M2TS, 3G2, OGV) are also accepted.



## Downloaded tools

Formatif never bundles ffmpeg. On the first compression that needs it, it
downloads the required tool into a `tools/` folder **next to the installed
executable** (not app-data):

- **ffmpeg** — gyan.dev release-essentials (image/video/gif/audio)
- **qpdf** — official GitHub release (PDF)
- **gifsicle** — eternallybored Windows build (GIF lossy optimization)

Manage them in **Settings → Tools** (install size + reinstall). A small
transient `cache/` folder (also next to the executable) is used for
decode/rasterize scratch work and is wiped on every launch and exit. During
development the ffmpeg on your `PATH` is used; override any tool with
`FORMATIF_<TOOL>` (e.g. `FORMATIF_FFMPEG`).

> ffmpeg's "essentials" build and gifsicle are GPL-licensed; qpdf is
> Apache-2.0. Because they're downloaded by the user at runtime rather than
> redistributed in the installer, Formatif's own installer and source tree
> ship no GPL binaries — but that license still applies to the tool itself if
> you redistribute a build that includes it.



## Getting started



### Prerequisites

- [mise](https://mise.jdx.dev) (provisions Node, pnpm and a dev FFmpeg), or
Node 26 + pnpm 11 manually.
- A Rust toolchain (`rustup`, stable).
- Windows with WebView2 (preinstalled on Windows 11).



### Setup & development

```sh
mise trust && mise install   # Node, pnpm, FFmpeg (dev)
pnpm install

pnpm tauri dev      # launch the desktop app (Rust + webview)
pnpm dev            # frontend only, in a browser (mock mode — no compression)
pnpm build          # type-check + build the frontend
cargo test --manifest-path src-tauri/Cargo.toml   # backend tests
```



### Building for release

```sh
pnpm tauri build
```

Output → `src-tauri/target/release/bundle/nsis/Formatif_<version>_x64-setup.exe`
(~4 MB — no bundled tools).

## Project structure

```
src/
  screens/                Main · Settings
  components/
    file-grid/            dropzone, thumbnail cards, run summary
    sidebar/              preset header, output card, per-type settings
    compression/          shared CompressionControls (sidebar + per-file)
    file-panel/           per-file override drawer
    settings/             settings nav + panels (incl. Tools tool manager)
  hooks/                  drag & drop, file ingest, compression run loop
  store/store.ts          zustand: useSettingsStore (persisted) + useAppStore
  lib/compress.ts         category/format metadata + helpers
  lib/pdf.ts              pdf.js render + pdf-lib rasterize/rebuild
  lib/decode.ts           HEIC/PSD/SVG → PNG decode (webview-side)
  lib/tauri.ts            command + event wrappers
src-tauri/src/
  tools.rs                download-on-demand tool manager (ffmpeg, qpdf, gifsicle)
  args.rs                 ffmpeg arg builder per category × format × quality
  commands.rs             compress pipeline, thumbnails, file expansion
  ffmpeg.rs               transcode core (progress + cancel)
  watcher.rs              folder monitoring (auto-compress on change)
  state.rs                job registry, cancellation, concurrency
```



## Roadmap

- Specialized optimizers (oxipng) wired through the tool manager.
- HEIC/HEIF input, "Target size" mode, clipboard output, jobs history.
- macOS build.



## Support the project

Formatif is free and always will be. If it saves you time, a tip is welcome but never required.



## License

[MIT](LICENSE)