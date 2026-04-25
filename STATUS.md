# STATUS

> Project-management state for `davidtech-updater`. Architecture and runbook live in `CLAUDE.md`; user-facing docs in `README.md`.

**last_touched:** 2026-04-25

---

## Now

`v0.4.0` — refactored to the AI-driven local-build model. **GitHub Actions release pipeline removed.** No more cron, no more PATs, no more cross-repo checkout. The release flow is now: open this repo in Claude Code, say "hey I updated <app>" in plain English, and Claude follows the runbook in CLAUDE.md to bump → build → publish → log. `apps.json` extended with `localPath` for each app; new commands `bump` and `set-path`.

Ready for the first real test of the new flow: `beam-profiler` is at source v1.2.1 (dialog plugin alignment fix already applied locally) but no R2 publish has succeeded yet for any version. Next conversation: "hey, ship beam profiler 1.2.1" should run end-to-end.

## Next actions

In order:

1. **First end-to-end test of the new flow.** From this repo, say: "hey I updated beam profiler". Claude reads CLAUDE.md, sees source is at v1.2.1 with no prior ship in RELEASES.md, asks user to confirm shipping 1.2.1, runs `npm run tauri build` in `C:\Users\mark2\Documents\MyRepos\dukane-beam-profiler`, then `publish beam-profiler --from=<path>`, then appends to RELEASES.md.

2. **Verify R2 manifest at the public URL** — `curl https://updates.davidtechllc.com/0ex2s23yt30r/beam-profiler/latest.json` should return v1.2.1 with an Ed25519 signature.

3. **Close the auto-update loop** — install the v1.1.0 build (or any prior shipped build) on a clean second machine / VM, click `SETTINGS → Check for Updates`, confirm the upgrade to v1.2.1 completes and relaunches cleanly.

4. **Delete the unused GitHub Secret** — `DAVIDTECH_REPO_TOKEN` at https://github.com/mark2messmore/davidtech-updater/settings/secrets/actions. The PAT it referenced is no longer used by anything in this repo. (`TAURI_SIGNING_PRIVATE_KEY` and `CLOUDFLARE_API_TOKEN` were also unused after the workflow deletion — same cleanup.)

## Backlog / not yet started

- **Migrate `dukane-cam-viewer`** off its inline `scripts/publish.js`. Constraint: keep the same slug (`ly0afixsg9hq`) so installed copies don't lose the update feed. After registering, `set-path` to its source dir.
- **Rust adapter** (`src/adapters/rust.js` — stubbed). Build when there's an actual Rust-native DavidTech app that needs it.
- **Qt adapter** (`src/adapters/qt.js` — stubbed). Same — build on demand.
- **electron + rust + qt support in `bump`** — the bumper currently only handles tauri's three version files. Add framework branches when those apps come online.

## Log

- **2026-04-25** — `v0.4.0`. Removed `.github/workflows/release.yml`, removed `src/commands/check-releases.js`, removed `STATUS.md` references to GH cron + PAT + secrets. Added `localPath` field to `apps.json` (schemaVersion bumped 1 → 2). Added `bump` command (rewrites package.json + Cargo.toml + tauri.conf.json in lockstep, refreshes both lockfiles), `set-path` command, `findApp()` fuzzy matcher in registry. Created `RELEASES.md` as the append-only ship log. Rewrote `CLAUDE.md` as a natural-language release runbook — when the user mentions an app + a release intent, Claude drives bump → build → publish → log entirely on the maintainer's machine. **No CI.** GitHub holds source code only; Cloudflare R2 + Worker handle distribution; Claude orchestrates.
- **2026-04-24** — `v0.3.0`. Added scheduled GH Actions release pipeline + `check-releases` command + cron + PAT-based cross-repo checkout. *Removed in v0.4.0.*
- **2026-04-24** — `v0.2.0`. Refactored to control-plane model. Breaking change from `v0.1.0`: `init` removed, `register` added, `apps.json` registry introduced, adapters rewritten as pure functions of ctx. Smoke-tested.
- **2026-04-24** — `v0.1.0`. Initial scaffold (per-app CLI dep model with `davidtech.config.json`). Worker + CLI + README + CI.

## Open questions

- **Cargo.lock refresh during bump** — the `bump` command runs `cargo metadata --offline` to rewrite Cargo.lock with the new package version, falling back to non-offline if needed. Watch this on the first real bump; if the offline path consistently fails (e.g. crates haven't been fetched since the last touch), drop the offline attempt and just run `cargo metadata` directly.
- **Multi-machine release** — current model assumes Mark's machine is the only build machine. If a second maintainer needs to ship from their laptop, they'd need: signing key copy, wrangler login, and `localPath` in apps.json pointing at *their* checkout location. The schema supports this (per-machine `localPath`s would need a different field name though — defer until needed).
