<div align="center">
<img src=".github/assets/logo.png" width="88" height="88" alt="Formatif logo">

# Formatif

**压缩图片、视频、GIF 和 PDF —— 免费、开源、100% 本地运行。**

无需上传，无需账号，无需订阅。所有处理都在你自己的电脑上完成。

[![Release](https://img.shields.io/github/v/release/aeroray/Formatif?label=release&color=9362F4)](https://github.com/aeroray/Formatif/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/aeroray/Formatif/total?color=9362F4)](https://github.com/aeroray/Formatif/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-9362F4)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-9362F4)](https://github.com/aeroray/Formatif/releases/latest)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri-24C8DB)](https://tauri.app)

[English](README.md) · [简体中文](README.zh-CN.md)

### [⬇ 下载最新版本](https://github.com/aeroray/Formatif/releases/latest)

<img src=".github/assets/app-preview.svg" width="760" alt="Formatif 正在批量压缩图片、视频、GIF 和 PDF 文件">
</div>

## 目录

- [特性](#特性)
- [macOS 安装说明](#macos-安装说明)
- [技术栈](#技术栈)
- [压缩原理](#压缩原理)
- [打包的工具](#打包的工具)
- [开始上手](#开始上手)
- [项目结构](#项目结构)
- [路线图](#路线图)
- [许可证](#许可证)

## 特性

- **免费开源（MIT）**——无需许可证、无付费墙、无遥测采集。
- **开箱即用**——ffmpeg、qpdf、gifsicle 均已打包进安装包，首次运行无需下载任何东西。
- **隐私优先**——文件永远不会离开你的电脑。
- **批量处理**——可以拖入单个文件*或整个文件夹*，并行压缩全部内容。
- **文件夹监听**——监听指定文件夹，自动压缩新拖入其中的文件。
- **预设**——内置一个只读的默认预设，也可以创建自己的命名预设，并对单个文件进行临时覆盖。
- **压缩前后对比**——图片、视频、GIF、PDF 都支持前后对比，直观查看体积与画质变化。
- **深色专注 UI**，提供 7 种强调色，中英文双语（根据系统语言自动选择）。

## macOS 安装说明

macOS 版本目前还没有代码签名（尚无 Apple 开发者证书），下载后系统会给它加上隔离标记，导致首次打开时提示类似"Formatif无法打开，因为它来自身份不明的开发者"而无法启动。将 `Formatif.app` 拖入 `/Applications` 后，可以选择：

- 右键（或按住 Control 点击）`Formatif.app` → **打开** → 在弹窗中确认**打开**，**或者**
- 在终端中执行一次：

  ```sh
  xattr -rd com.apple.quarantine /Applications/Formatif.app
  ```

## 技术栈

- **Tauri 2**（Rust）外壳 + **React 19 + TypeScript + Vite** 前端
- **shadcn/ui**（Tailwind v4、Radix）+ **zustand**
- 外部命令行工具，**打包进安装包**：**ffmpeg**（图片/视频/GIF）、**qpdf**（PDF 结构优化）、**gifsicle**（GIF 有损压缩）。

## 压缩原理

每个文件都属于一个类别——**图片**、**视频**、**GIF** 或 **PDF**——各自拥有独立的设置：

| 设置项     | 可选项                                                                                                  |
| ------- | ---------------------------------------------------------------------------------------------------- |
| 质量      | 原始 · 均衡 · 高 · 中 · 低                                                                                  |
| 分辨率     | 100% · 75% · 50% · 25%                                                                               |
| 格式（图片）  | 原始 · JPEG · PNG · WebP · AVIF · ICO                                                                  |
| 格式（视频）  | 原始 · MP4 · WebM · MOV · MKV · AVI · WMV · FLV · M4V · 3GP · GIF · MP3 · AAC · WAV · FLAC · OGG · M4A |
| 格式（GIF） | 原始 · MP4 · WebM · WebP                                                                               |
| PDF     | 始终保持 PDF 格式                                                                                          |

- **图片 / 视频**——Rust 后端根据（类别 × 格式 × 质量）在 [`args.rs`](src-tauri/src/args.rs) 中拼出对应的 ffmpeg 参数；进度、取消与结果通过 `compress://*` 事件流式返回前端。
- **GIF**——先由 ffmpeg 重建调色板（帧率与颜色数由质量档位决定），再由 **gifsicle** 在此基础上做有损压缩——单靠 ffmpeg 无法压缩一个已经优化过的 GIF，真正把体积压下去的是 gifsicle。
- **PDF**——使用 **qpdf** 做无损重压缩。对于图片较多的 PDF，还有一个可选的「栅格化重建」步骤（在前端用 pdf.js + pdf-lib 完成），可以进一步降采样其中的图片；只有当结果确实比原文件更小时才会采用。
- 输入格式支持比上表的输出格式更广：HEIC/HEIF、PSD、SVG、TIFF、BMP、TGA、JPEG-2000 图片会先解码为 PNG 再压缩；常见的旧版视频容器（MPG、TS、M2TS、3G2、OGV）同样可以作为输入。

## 打包的工具

ffmpeg、qpdf、gifsicle 都直接打包在安装包内——运行时不会下载任何东西：

- **ffmpeg**——Windows 上用 gyan.dev 的 release-essentials 构建（图片/视频/GIF/音频）
- **qpdf**——Windows 上用官方发行版；macOS 上用 Homebrew 的预编译版本
- **gifsicle**——Windows 上用 eternallybored 的构建；macOS 上用 Homebrew 的预编译版本（GIF 有损压缩）

它们在构建时被暂存到 `src-tauri/tools-staging/`（见 [`scripts/stage-tools-windows.ps1`](scripts/stage-tools-windows.ps1) / [`scripts/stage-tools-macos.sh`](scripts/stage-tools-macos.sh)），再随安装包一起安装到主程序旁边。程序同级还有一个临时的 `cache/` 文件夹，用于解码/栅格化过程中的中间文件，每次启动和退出时都会自动清空。开发环境下会优先使用 `PATH` 中的 ffmpeg，而不是暂存的副本；也可以用 `FORMATIF_<TOOL>`（例如 `FORMATIF_FFMPEG`）环境变量覆盖任意工具的路径。

> ffmpeg 的 "essentials" 构建版本和 gifsicle 均采用 GPL 许可证；qpdf 采用 Apache-2.0 许可证。它们是作为独立的可执行文件、以子进程方式被调用的（并没有链接进 Formatif 自身的代码），这正是 GPL 明确允许的"单纯聚合"（mere aggregation）——但安装包中确实包含了 GPL 许可的二进制文件。Formatif 自身的代码仍为 [MIT](LICENSE) 许可；打包的这些工具仍遵循它们各自的许可证。

## 开始上手

### 前置依赖

- [mise](https://mise.jdx.dev)（会自动准备 Node、pnpm 以及开发用的 FFmpeg），或者手动安装 Node 26 + pnpm 11。
- Rust 工具链（`rustup`，stable 版本）。
- Windows 系统需要 WebView2（Windows 11 已预装）。

### 安装与开发

```sh
mise trust && mise install   # 安装 Node、pnpm、FFmpeg（开发用）
pnpm install

pnpm tauri dev      # 启动桌面应用（Rust + webview）
pnpm dev            # 仅启动前端，在浏览器中运行（模拟模式——不能真正压缩）
pnpm build          # 类型检查 + 构建前端
cargo test --manifest-path src-tauri/Cargo.toml   # 后端测试
```

### 构建发布版本

```sh
pnpm tauri build
```

输出路径 → `src-tauri/target/release/bundle/nsis/Formatif_<version>_x64-setup.exe`（约 34 MB，已打包 ffmpeg/qpdf/gifsicle——`mise run build` 会自动先完成暂存）。

## 项目结构

```
src/
  screens/                主界面 · 设置
  components/
    file-grid/            投放区、缩略图卡片、运行汇总
    sidebar/               预设头部、输出设置卡片、各类型压缩设置
    compression/           共享的 CompressionControls（侧栏 + 单文件面板通用）
    file-panel/             单文件覆盖设置面板
    settings/               设置导航 + 各设置页
  hooks/                   拖拽处理、文件接入、压缩运行循环
  store/store.ts           zustand：useSettingsStore（持久化）+ useAppStore
  lib/compress.ts          类别/格式元数据与工具函数
  lib/pdf.ts               pdf.js 渲染 + pdf-lib 栅格化重建
  lib/decode.ts            HEIC/PSD/SVG → PNG 解码（前端侧）
  lib/tauri.ts             命令与事件封装
src-tauri/src/
  tools.rs                 解析已打包工具的路径（ffmpeg、qpdf、gifsicle）
  args.rs                  按（类别 × 格式 × 质量）拼装 ffmpeg 参数
  commands.rs               压缩流程、缩略图、文件展开
  ffmpeg.rs                 转码核心（进度 + 取消）
  watcher.rs                文件夹监听（变化时自动压缩）
  state.rs                   任务注册表、取消机制、并发控制
```

## 路线图

- 接入更多专用优化工具（如 oxipng）。
- HEIC/HEIF 输入、「目标大小」模式、剪贴板输出、任务历史记录。
- 对 macOS 构建进行代码签名与 notarization；支持 Intel Mac。

## 许可证

[MIT](LICENSE) —— Formatif 自身代码。打包的第三方工具（ffmpeg、gifsicle、qpdf）仍遵循它们各自的许可证，详见[打包的工具](#打包的工具)。
