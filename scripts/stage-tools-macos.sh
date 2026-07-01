#!/bin/bash
# Stages ffmpeg, qpdf and gifsicle (via Homebrew) into src-tauri/tools-staging/
# so Tauri bundles them into the macOS .app (Apple Silicon only — see the
# "resources" entry in tauri.conf.json). Homebrew's bottles are dynamically
# linked against other Homebrew-installed dylibs at absolute /opt/homebrew/...
# paths, which won't exist on an end user's Mac without Homebrew installed —
# dylibbundler rewrites those references to @executable_path-relative paths
# and copies the dylibs alongside, so the binaries are self-contained.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGING="$ROOT/src-tauri/tools-staging"
mkdir -p "$STAGING"

brew list dylibbundler >/dev/null 2>&1 || brew install dylibbundler
brew install ffmpeg qpdf gifsicle

for name in ffmpeg qpdf gifsicle; do
  src="$(brew --prefix "$name")/bin/$name"
  echo "Staging $name from $src"
  cp "$src" "$STAGING/$name"
done

echo "--- dependencies before bundling ---"
for f in ffmpeg qpdf gifsicle; do otool -L "$STAGING/$f"; done

# -od: wipe+recreate the libs dir; -b: copy+fix bundled dylibs (incl.
# transitive deps); -x (repeatable): fix each executable's own references.
# -p matches our flat layout (libs/ sits next to the exes, not in ../libs).
dylibbundler -od -b \
  -x "$STAGING/ffmpeg" -x "$STAGING/qpdf" -x "$STAGING/gifsicle" \
  -d "$STAGING/libs" -p "@executable_path/libs/"

# dylibbundler ad-hoc signs by default, but install_name_tool invalidates
# signatures on every rewrite it does — re-sign explicitly as insurance.
echo "--- re-signing ---"
codesign --force -s - "$STAGING/ffmpeg" "$STAGING/qpdf" "$STAGING/gifsicle"
if [ -d "$STAGING/libs" ]; then
  find "$STAGING/libs" -name "*.dylib" -exec codesign --force -s - {} \;
fi

echo "--- dependencies after bundling ---"
for f in ffmpeg qpdf gifsicle; do otool -L "$STAGING/$f"; done

echo "Staged tools:"
find "$STAGING" -type f -exec ls -la {} \;
