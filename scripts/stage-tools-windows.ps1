# Stages ffmpeg.exe, qpdf.exe (+ its DLLs) and gifsicle.exe into
# src-tauri/tools-staging/ so Tauri bundles them into the Windows installer
# (see the "resources" entry in tauri.conf.json). Used both locally
# (`mise run stage-tools`) and in CI (release.yml) — keep them in sync.
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$staging = Join-Path $root "src-tauri\tools-staging"
New-Item -ItemType Directory -Force -Path $staging | Out-Null
$tmp = Join-Path $env:TEMP "formatif-tools-stage"
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

function Stage-Ffmpeg {
    if (Test-Path (Join-Path $staging "ffmpeg.exe")) { return }
    Write-Output "Staging ffmpeg..."
    $zip = Join-Path $tmp "ffmpeg.zip"
    Invoke-WebRequest -Uri "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" -OutFile $zip
    $extractDir = Join-Path $tmp "ffmpeg-extract"
    Remove-Item -Recurse -Force $extractDir -ErrorAction SilentlyContinue
    Expand-Archive -Path $zip -DestinationPath $extractDir -Force
    $exe = Get-ChildItem -Path $extractDir -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
    if (-not $exe) { throw "ffmpeg.exe not found in downloaded archive" }
    Copy-Item $exe.FullName (Join-Path $staging "ffmpeg.exe") -Force
}

function Stage-Qpdf {
    if (Test-Path (Join-Path $staging "qpdf.exe")) { return }
    Write-Output "Staging qpdf..."
    $zip = Join-Path $tmp "qpdf.zip"
    Invoke-WebRequest -Uri "https://github.com/qpdf/qpdf/releases/download/v11.9.1/qpdf-11.9.1-msvc64.zip" -OutFile $zip
    $extractDir = Join-Path $tmp "qpdf-extract"
    Remove-Item -Recurse -Force $extractDir -ErrorAction SilentlyContinue
    Expand-Archive -Path $zip -DestinationPath $extractDir -Force
    $binDir = Get-ChildItem -Path $extractDir -Recurse -Directory -Filter "bin" | Select-Object -First 1
    if (-not $binDir) { throw "qpdf bin/ dir not found in downloaded archive" }
    Copy-Item (Join-Path $binDir.FullName "*") $staging -Force
}

function Stage-Gifsicle {
    if (Test-Path (Join-Path $staging "gifsicle.exe")) { return }
    Write-Output "Staging gifsicle..."
    $zip = Join-Path $tmp "gifsicle.zip"
    Invoke-WebRequest -Uri "https://eternallybored.org/misc/gifsicle/releases/gifsicle-1.95-win64.zip" -OutFile $zip
    $extractDir = Join-Path $tmp "gifsicle-extract"
    Remove-Item -Recurse -Force $extractDir -ErrorAction SilentlyContinue
    Expand-Archive -Path $zip -DestinationPath $extractDir -Force
    $exe = Get-ChildItem -Path $extractDir -Recurse -Filter "gifsicle.exe" | Select-Object -First 1
    if (-not $exe) { throw "gifsicle.exe not found in downloaded archive" }
    Copy-Item $exe.FullName (Join-Path $staging "gifsicle.exe") -Force
}

Stage-Ffmpeg
Stage-Qpdf
Stage-Gifsicle

Write-Output "Staged tools:"
Get-ChildItem $staging | Select-Object Name, Length | Format-Table -AutoSize
