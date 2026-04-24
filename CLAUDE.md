# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Project-management state (current focus, next actions, blockers, log) lives in `STATUS.md` at the repo root — not here. When substantive work happens, update `STATUS.md`: overwrite `Now`, append to `Log`, bump `last_touched`. This `CLAUDE.md` is for architecture and conventions; `STATUS.md` is for what's happening this week.

`README.md` is the user-facing doc — onboarding, CLI reference, troubleshooting. Don't duplicate it here. Trust it.

## Commands

```bash
npm run help                                                        # CLI usage
npm run register -- <name> --framework=<fw> [--repo=<owner/name>]   # Add an app to apps.json
npm run publish  -- <name> [tag] [--from=<path>] [--dry-run]        # Ship a release to R2
npm run apps                                                        # List registered apps
node bin/davidtech-updater.js <cmd> <args>                          # Equivalent, no -- needed
```

There are no unit tests. CI (`.github/workflows/ci.yml`) smoke-tests by running `--help` and `slug`. The real verification is a `--dry-run` against a real project root before any live publish.

Publish prerequisites on the maintainer's machine:
- `wrangler` — cached OAuth via `wrangler login`, or `CLOUDFLARE_API_TOKEN` with R2 write on `davidtech-app-updates`
- `gh` — only needed when fetching artifacts from GitHub Releases (i.e. no `--from`)
- Node 18+

## Architecture

### This is a control plane, not a per-app library

`davidtech-updater` is **the single source of truth** for every DavidTech app's auto-update config. Target apps don't install this package — they only carry the irreducible-minimum client-side wiring (updater plugin + pubkey + endpoint). All the release machinery, secrets, and registry live here.

`apps.json` at the repo root is the registry. Every app has a unique `slug` (gates the R2 URL), a `framework` (picks the adapter), and an optional `repo` (GitHub source for release-fetched publishes). That file is the canonical list — `register` appends to it, `publish` looks up from it. Commit it. No secrets; the slug is visible in every installed app binary.

This replaces the v0.1.0 "install CLI in each app with a `davidtech.config.json`" design — see the v0.2.0 commit for the rationale.

### The three moving parts

1. **CLI** (`src/`, `bin/`) — JS ESM, zero runtime deps. Commands live in `src/commands/`, dispatch through `src/index.js`. Adapters in `src/adapters/` are framework-specific: they take `{artifactsDir, slug, app, version, notes, dryRun}` and hand uniform uploads to `upload.js`.

2. **Worker** (`worker/`) — Cloudflare Worker at `updates.davidtechllc.com`, already deployed. Path-gates `/<slug>/<app>/<file>` through an allowlist regex, proxies R2 `davidtech-app-updates`. Single file, `workers_dev = false`, route is a custom domain.

3. **R2 bucket** (`davidtech-app-updates`) — dumb storage. Objects keyed `<slug>/<app>/<file>`.

All three share one invariant: the `slug` / `app` / `filename` regexes in `worker/src/index.js` **must match** `SLUG_RE` / `APP_RE` and the content-type table in `src/config.js` + `src/upload.js`. A drift means the CLI will happily upload files the Worker then 404s on.

### Publish flow

`publish <name> [tag] [--from=<path>] [--dry-run]`:

1. Look up `<name>` in `apps.json`. If absent, fail with "Known apps: ..." hint.
2. Resolve artifacts:
   - `--from=<path>` → treat path as project root; adapter derives the build-output subdir (e.g. Tauri → `<root>/src-tauri/target/release/bundle/nsis`). Version comes from the project's own source of truth (`tauri.conf.json` or `package.json`). Release notes from `RELEASE_NOTES.md` / `.txt` / `NOTES.md` at the root, if present.
   - Otherwise → `gh release download` into a temp dir using framework-specific patterns. Version is the tag with leading `v` stripped. Notes are the GH release body.
3. Dispatch to the adapter. It reads from `artifactsDir`, optionally writes a manifest alongside (Tauri: `latest.json`; Electron: ships electron-builder's `latest.yml`), and calls `upload.js` for each file.
4. Temp dir (GH path) is cleaned up in `finally`.

Adapters **never touch `cwd`** — that was a v0.1.0 constraint. Everything they need comes in via the ctx object.

### Option A vs Option B (publish modes)

Two ways to get to a signed, published release:

- **Option A — local build, local publish** (current default and what the README recommends): `tauri build` happens on the maintainer's laptop with `TAURI_SIGNING_PRIVATE_KEY` read from `~/.tauri/davidtech_updater.key`. `npm run publish -- <app> --from=<path>` ships from the laptop. Zero GitHub secrets, zero per-app CI changes.
- **Option B — CI build, local or CI publish**: `tauri-action` in the target app's CI builds + signs (with the signing key as a repo secret) + attaches to a GH Release. Then `npm run publish -- <app> <tag>` fetches those assets. Target app still needs the signing-key secret, but the Cloudflare token stays only here.

Option A was picked as the starting point. Don't design for Option B until the user asks — both paths already work in the code.

### Framework adapters

Current state:
- `electron.js` — implemented. Uploads `latest.yml` + `*.exe` + `*.blockmap` from `<root>/dist` or a release.
- `tauri.js` — implemented. Generates `latest.json` inlining the signature from the `.sig` file, uploads `.nsis.zip` + `.sig` + `latest.json`.
- `rust.js`, `qt.js` — stubs that throw "not yet implemented" with a pointer to the porting guidance. Add adapters here, don't branch on framework anywhere else.

Every adapter is a pure function of its ctx. If you need another framework, the diff should be exactly: one new file in `src/adapters/`, one import in `src/commands/publish.js`'s `ADAPTERS` map, one pattern set in `src/fetch.js`'s `PATTERNS_BY_FRAMEWORK`, and an `assertFramework` regex update if the name is new. The Worker's extension allowlist already covers every framework listed in `FRAMEWORKS`.

### Adding a new app

User-facing steps are in the README. The code-level invariant: `register` is the *only* way to add an entry to `apps.json`. Don't teach anyone to hand-edit — the `registeredAt` timestamp and schema version protect against malformed entries, and `register` validates slug/app/framework/repo shapes through `src/config.js`.

## Conventions

- **Worker regex must match CLI validators.** `src/config.js` has `SLUG_RE` / `APP_RE` — these are the source of truth. `worker/src/index.js` repeats them inline (Cloudflare Workers can't share source with the CLI). When you change one, change the other in the same commit.
- **Adapters are pure over `ctx`.** No `process.cwd()` reads, no `fs.existsSync` walks outside of `artifactsDir`. All resolution happens in `publish.js`'s `resolveLocalArtifacts`. This is what lets the same adapter serve both local and release-fetched publishes.
- **No runtime dependencies.** `peerDependencies.wrangler` is marked optional — `upload.js` shells out to `npx wrangler`, so if wrangler isn't globally installed npx will fetch it. Same applies to `gh`. Don't add `commander` / `yargs` / `chalk` — the hand-rolled arg parser in each command is ~15 lines and matches npm-script conventions (positional + `--flag=value`).
- **Exit codes matter.** Validation failures exit `2` (bad invocation). Runtime failures (duplicate register, unknown app, missing artifacts, wrangler error) propagate through `bin/davidtech-updater.js`'s top-level `.catch` and exit `1`. Don't swallow errors to log-and-continue — callers rely on exit codes.
- **Dry-run preserves the manifest.** Tauri's `publish --dry-run` still writes `latest.json` to `artifactsDir` — the write is idempotent and inspecting the generated manifest is the whole point of dry-run. Only the `wrangler r2 put` calls are skipped.

## Versioning

This repo ships as `github:mark2messmore/davidtech-updater` — no npm publish. Consumers (the maintainer) pin to a tag or commit SHA when referencing it from anywhere else. Current approach: bump `package.json.version`, `git tag -a vX.Y.Z`, `git push origin vX.Y.Z`. Breaking CLI-shape changes warrant a minor bump while the version is `0.x`, a major bump after `1.0`.
