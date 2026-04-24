# STATUS

> Project-management state for `davidtech-updater`. Architecture and conventions live in `CLAUDE.md`; user-facing docs in `README.md`. This file is for what's happening *this week*.

**last_touched:** 2026-04-24

---

## Now

Repo is at `v0.3.0` (uncommitted) — the scheduled release workflow is built. `beam-profiler` is registered. Manual `publish` path still works as fallback. **Immediate blocker on the automation:** three GitHub repo secrets need to be set in this repo's Settings → Secrets: `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (skip if no password), `CLOUDFLARE_API_TOKEN`. Until those land, the cron will fire but the first build job will fail on signing.

## Next actions

In order:

1. **Set three GitHub repo secrets** at https://github.com/mark2messmore/davidtech-updater/settings/secrets/actions —
   - `TAURI_SIGNING_PRIVATE_KEY` = entire contents of `%USERPROFILE%\.tauri\davidtech_updater.key` (paste the file)
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = key password if one was set; skip this secret if it's empty
   - `CLOUDFLARE_API_TOKEN` = R2 write token scoped to `davidtech-app-updates` (create at https://dash.cloudflare.com/profile/api-tokens → Custom token → R2: Edit on this specific bucket)

2. **Commit + tag beam-profiler v1.2.0** (bundles the auto-update wiring and Settings-menu consolidation from this session):
   ```bash
   cd ../../Documents/MyRepos/dukane-beam-profiler
   # Bump to 1.2.0 in package.json, src-tauri/Cargo.toml, src-tauri/tauri.conf.json
   git add -A && git commit -m "v1.2.0 — auto-update support + Settings menu"
   git tag v1.2.0
   git push && git push --tags
   ```

3. **Watch the scheduled workflow run** at https://github.com/mark2messmore/davidtech-updater/actions, or kick it immediately without waiting 15 min:
   ```bash
   gh workflow run release.yml --repo mark2messmore/davidtech-updater
   ```

4. **Verify** with `curl https://updates.davidtechllc.com/0ex2s23yt30r/beam-profiler/latest.json` — should return a manifest with `"version": "1.2.0"` and an inlined Ed25519 signature.

5. **Close the loop** by installing the previously-released v1.1.0 build (on any second machine / VM / fresh user), click `SETTINGS → Check for Updates`, confirm the v1.1.0 → v1.2.0 upgrade completes and relaunches cleanly.

## Backlog / not yet started

- **Migrate `dukane-cam-viewer`** off its inline `scripts/publish.js`. Constraint: keep the same slug (`ly0afixsg9hq`) so installed copies don't lose the update feed. Pre-edit the generated `apps.json` entry to carry the existing slug before the first scheduled run picks it up.
- **Rust adapter** (`src/adapters/rust.js` — stubbed). Only build when there's an actual Rust-native DavidTech app that needs it.
- **Qt adapter** (`src/adapters/qt.js` — stubbed). Same — build on demand.
- **Build caching** — workflow has Rust target cache, but node_modules cache and Tauri bundler intermediate cache could shave more time. Revisit once release cadence justifies it.
- **Private-repo support** — the workflow's `actions/checkout@v4` on the target repo works for public repos only. Add a PAT secret + token input when a private DavidTech app needs auto-releasing.

## Log

- **2026-04-24** — `v0.3.0` (uncommitted). Added `check-releases` command that diffs registered apps' latest v-tags against R2 manifests, emits a matrix JSON. Added `.github/workflows/release.yml` — 15-minute cron + manual dispatch, plan job (linux) emits matrix, release job (windows, matrix) clones target + builds + publishes. Signing key + Cloudflare token live in this repo's Secrets only; target apps carry no release plumbing. Updated README + CLAUDE.md to reflect the automation as the primary path, with manual publish retained as fallback for debugging / emergency / first bring-up.
- **2026-04-24** — Scaffolded repo at `v0.1.0` (per-app CLI dep model with `davidtech.config.json`). Worker + CLI + README + CI, published to `github.com/mark2messmore/davidtech-updater`, tagged `v0.1.0`.
- **2026-04-24** — Refactored to control-plane model at `v0.2.0`. Breaking change from `v0.1.0`: `init` removed, `register` added, `apps.json` registry introduced, adapters rewritten to be pure over a ctx object. Smoke-tested: register validates + refuses dupes; publish on a synthetic Tauri tree generates a well-formed `latest.json` with the right URL and picks up `RELEASE_NOTES.md`. Tagged `v0.2.0`, CI green.

## Open questions

- The `tauri.conf.json.version` must match the git tag, or the build produces a differently-named bundle and the R2 publish becomes a no-op. First end-to-end run will confirm. Could add a version-consistency check to the workflow as a pre-build step.
- `actions/checkout@v4` defaults to `fetch-depth: 1` — if the target app needs history for version-stamping (Tauri usually doesn't), bump `fetch-depth` in the workflow.
- Cron cadence is `*/15 * * * *` (15 min). GitHub sometimes delays scheduled runs during peak load. If immediate release is critical, use `gh workflow run` instead of waiting.