fn main() {
    // tauri-build validates that `bundle.resources` paths exist even for a
    // plain `cargo check`/`build`, not just `tauri build`. This dir is
    // populated with the real ffmpeg/qpdf/gifsicle binaries by a staging step
    // before bundling (mise's stage-tools task locally, release.yml in CI);
    // create it empty here so a fresh checkout still compiles.
    std::fs::create_dir_all("tools-staging").expect("create tools-staging dir");
    tauri_build::build()
}
