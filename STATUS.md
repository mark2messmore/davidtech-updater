# STATUS

> Project-management state for `davidtech-updater`. Architecture and conventions live in `CLAUDE.md`; user-facing docs in `README.md`. This file is for what's happening *this week*.

**last_touched:** 2026-04-24

---

## Now

Repo is at `v0.2.0` — control-plane model is working, `register` + `publish` smoke-tested end-to-end against a synthetic Tauri project. Nothing is registered in `apps.json` yet.

**Immediate blocker:** no DavidTech Tauri app has ever completed the end-to-end round trip yet. `beam-profiler` is the intended first real user — wiring is still on the target-app side (plugin install, pubkey, UI button) before we can do a live `publish`.

## Next actions

In order:

1. **One-time, shared across every future Tauri app:** generate the Ed25519 keypair:
   ```bash
   tauri signer generate -w ~/.tauri/davidtech_updater.key
   ```
   Copy the printed pubkey somewhere durable — it goes into every DavidTech Tauri app's `tauri.conf.json`.

2. **Register beam-profiler** in this repo:
   ```bash
   npm run register -- beam-profiler --framework=tauri --repo=mark2messmore/dukane-beam-profiler
   ```

3. **Wire beam-profiler's target-app side** (separate repo — `C:\Users\mark2\Documents\MyRepos\dukane-beam-profiler`):
   - `cargo add tauri-plugin-updater --features native-tls` in `src-tauri/`
   - `npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process`
   - Paste the updater block (printed by `register`) into `src-tauri/tauri.conf.json`, fill in the pubkey from step 1
   - Register the plugin in `src-tauri/src/lib.rs`
   - Add a "Check for updates" button in the UI (5 lines using `check()` → `downloadAndInstall()` → `relaunch()`)
   - Bump versions (`package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`) together

4. **First live publish** (Option A, local build):
   ```bash
   cd ../dukane-beam-profiler
   TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/davidtech_updater.key)" npm run tauri build
   cd ../davidtech-updater        # or wherever this repo lives for the user
   npm run publish -- beam-profiler --from=C:/Users/mark2/Documents/MyRepos/dukane-beam-profiler --dry-run
   # inspect the generated latest.json, then drop --dry-run
   ```

5. **Verify** by `curl https://updates.davidtechllc.com/<slug>/beam-profiler/latest.json` and by launching an older installed beam-profiler build and hitting the "Check for updates" button.

## Backlog / not yet started

- **Migrate `dukane-cam-viewer`** off its inline `scripts/publish.js`. Constraint: keep the same slug (`ly0afixsg9hq`) so installed copies don't lose the update feed. The README's "Migration from inline publish.js" section documents the three-step path — pre-edit the generated `apps.json` entry to carry the existing slug.
- **Rust adapter** (`src/adapters/rust.js` — stubbed). Only build when there's an actual Rust-native DavidTech app that needs it.
- **Qt adapter** (`src/adapters/qt.js` — stubbed). Same — build on demand.
- **Option B (CI-driven publish)** — works in the code but not yet exercised. Upgrade path once Option A feels tight: target app's release workflow uploads signed artifacts to a GH Release, maintainer runs `npm run publish -- <app> <tag>` to push them to R2. Eventually the publish could move into a workflow in this repo triggered by `repository_dispatch`.

## Log

- **2026-04-24** — Scaffolded repo at `v0.1.0` (per-app CLI dep model with `davidtech.config.json`). Worker + CLI + README + CI, published to `github.com/mark2messmore/davidtech-updater`, tagged `v0.1.0`.
- **2026-04-24** — Refactored to control-plane model at `v0.2.0`. Breaking change from `v0.1.0`: `init` removed, `register` added, `apps.json` registry introduced, adapters rewritten to be pure over a ctx object. Smoke-tested: register validates + refuses dupes; publish on a synthetic Tauri tree generates a well-formed `latest.json` with the right URL and picks up `RELEASE_NOTES.md`. Tagged `v0.2.0`, CI green.

## Open questions

- Release-body-as-notes for GH-sourced publishes is wired in `src/fetch.js::releaseBody`. Hasn't been exercised against a real GH release yet — verify during the first non-`--from` publish.
- `gh release download` with `--pattern` accepts shell globs — confirm on Windows PowerShell vs. Git Bash that `"*.nsis.zip"` passes through unexpanded. Smoke-tested so far only under Git Bash.
