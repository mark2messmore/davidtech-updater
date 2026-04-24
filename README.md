# davidtech-updater

Auto-update **control plane** for DavidTech apps. One repo. One registry of every app. One place that holds the signing key and the Cloudflare token.

## The shipping workflow

```bash
# In the app repo (e.g. dukane-beam-profiler):
# bump version in package.json / Cargo.toml / tauri.conf.json
git commit -am "v1.2.0"
git tag v1.2.0
git push --tags

# Wait up to 15 minutes. A scheduled workflow in this repo builds + signs +
# publishes automatically. Next time any installed app checks, it sees the new version.
```

That's the entire loop. Target apps themselves hold only the in-app wiring (updater plugin + pubkey + endpoint) and **do not** carry signing keys, Cloudflare tokens, release workflows, or `davidtech-updater` as a dependency.

One-time onboarding per app is still `npm run register -- <name>` from this repo — see [Registering a new app](#registering-a-new-app).

---

## What's already running (do not recreate)

| Resource | Name / URL |
|---|---|
| R2 bucket | `davidtech-app-updates` |
| Cloudflare Worker | `davidtech-update-worker` at `updates.davidtechllc.com` |
| Cloudflare account | `mark2messmore@gmail.com` (account ID `54899a88ce46b4d2344e8dbfe69c6c9c`) |
| URL shape | `https://updates.davidtechllc.com/<slug>/<app>/<file>` |

---

## The registry — `apps.json`

Every DavidTech app lives in one file at the repo root:

```json
{
  "schemaVersion": 1,
  "apps": {
    "beam-profiler": {
      "slug": "vuc97kf7i4pq",
      "framework": "tauri",
      "repo": "mark2messmore/dukane-beam-profiler",
      "registeredAt": "2026-04-24T19:00:00Z"
    }
  }
}
```

Commit it. No secrets in here — the slug is visible inside every installed app binary anyway.

---

## Prerequisites

### One-time, on GitHub (enables automated releases)

In `mark2messmore/davidtech-updater` → Settings → Secrets and variables → Actions, add:

| Secret | Value |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~/.tauri/davidtech_updater.key` — paste the whole file |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The password you set when generating the key (omit if you hit Enter twice for no password) |
| `CLOUDFLARE_API_TOKEN` | R2 write token scoped to `davidtech-app-updates` |

Without these, the scheduled release workflow will fail visibly on the first run after a tagged push — you don't have to set them to merge this repo, but nothing ships until they're set.

### One-time, on the maintainer laptop (for manual publish / local admin)

```bash
npm install           # zero runtime deps — this just populates node_modules/.bin
wrangler login        # caches OAuth; see 'wrangler whoami' to confirm
gh auth login         # for cross-repo tag / release lookups when running locally
```

For **Tauri apps** you also need the shared signing keypair. Generate **once, reuse across every DavidTech Tauri app, forever**:

```bash
npx tauri signer generate -w ~/.tauri/davidtech_updater.key
```

Keep the private key safe — losing it means every app using its pubkey can never ship another update. The pubkey file (`.pub`) goes into every Tauri app's `tauri.conf.json`.

---

## Registering a new app

```bash
npm run register -- <name> --framework=<electron|tauri|rust|qt> --repo=<owner/name>
```

Example:
```bash
npm run register -- beam-profiler --framework=tauri --repo=mark2messmore/dukane-beam-profiler
```

`register`:
1. Generates a unique 12-char slug.
2. Appends the entry to `apps.json`.
3. Prints a framework-specific next-steps block you paste into the target app (updater plugin config, endpoint URL, etc.).

The `--repo` flag is optional but strongly recommended — without it, `publish` can only work with `--from=<local-path>`.

---

## Publishing

The primary path is **automatic** — bump + tag + push in the target app repo, and the scheduled workflow in this repo takes care of the rest. See "Automated release workflow" below.

The CLI also supports three manual modes for debugging, emergency releases, or initial bring-up:

```bash
npm run publish -- <name> [tag] [--from=<local-path>] [--dry-run]
```

1. **`--from=<path>`** — read artifacts from a locally-built project root. Useful for proving out a new app before you trust CI with it.
2. **Explicit tag** — download that GitHub Release's assets via `gh` (requires a GH Release to exist, produced by e.g. `tauri-action`).
3. **Omit tag** — download the latest GitHub Release's assets.

`--dry-run` on any mode prints the wrangler uploads that would run (and writes the Tauri manifest to inspect) without actually uploading.

## Automated release workflow

`.github/workflows/release.yml` in this repo runs every 15 minutes and on manual dispatch. Its pipeline:

1. **Plan** (linux): `check-releases --json` compares each app in `apps.json` against what's live on R2. Emits a matrix of apps that need publishing.
2. **Release** (windows, per-app matrix):
   - Clone the target repo at the tag
   - Install deps, install Rust toolchain for Tauri apps
   - Build with `TAURI_SIGNING_PRIVATE_KEY` from repo secrets
   - Publish to R2 with `CLOUDFLARE_API_TOKEN` from repo secrets

The plan job's outputs include the full table of apps and their status, so the Actions run logs let you see what the cron decided at a glance.

**To trigger manually:** Actions tab → Release → Run workflow. Or `gh workflow run release.yml --repo mark2messmore/davidtech-updater`.

**To speed up the cadence:** edit the cron in the workflow — `*/5 * * * *` gives 5-minute polling; `0 * * * *` gives hourly.

**Notes:**
- App repos must be **public** for the workflow to clone them without auth. For private repos, add a PAT secret with cross-repo read scope and pass it to the `actions/checkout@v4` step that checks out the app.
- The matching `tauri.conf.json` version must agree with the tag — if you tag `v1.2.0` but leave the conf at 1.1.0, Tauri builds a `_1.1.0_` bundle and the publish becomes a no-op (R2 already has 1.1.0, so `check-releases` won't re-schedule it).
- `concurrency: release` prevents two cron ticks fighting. A build in progress finishes; the next cron tick waits.

---

## Framework details

### Tauri v2 — target-app wiring

1. Shared one-time setup (done once per maintainer): `tauri signer generate -w ~/.tauri/davidtech_updater.key`
2. In the target repo:
   ```bash
   cargo add tauri-plugin-updater --features native-tls --manifest-path src-tauri/Cargo.toml
   npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process
   ```
3. Paste into `src-tauri/tauri.conf.json` (pubkey + endpoint printed by `register`):
   ```json
   {
     "plugins": {
       "updater": {
         "active": true,
         "dialog": false,
         "pubkey": "<SHARED_DAVIDTECH_PUBKEY>",
         "endpoints": ["https://updates.davidtechllc.com/<slug>/<app>/latest.json"]
       }
     },
     "bundle": { "createUpdaterArtifacts": true, "targets": ["nsis"] }
   }
   ```
4. Register the plugin in `src-tauri/src/lib.rs`:
   ```rust
   .plugin(tauri_plugin_updater::Builder::new().build())
   ```
5. Wire a "Check for updates" button in the UI — ~5 lines:
   ```ts
   import { check } from '@tauri-apps/plugin-updater';
   import { relaunch } from '@tauri-apps/plugin-process';

   const update = await check();
   if (update?.available) {
     await update.downloadAndInstall();
     await relaunch();
   }
   ```
6. Build with the signing key in the environment:
   ```bash
   TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/davidtech_updater.key)" npm run tauri build
   ```

Release notes: if `RELEASE_NOTES.md` / `.txt` / `NOTES.md` exists at the project root, its contents become the manifest's `notes` field for local publishes. For GitHub-sourced publishes, the release body is used.

### Electron — target-app wiring

1. Install `electron-updater` (target app's `package.json`).
2. Configure electron-builder publish (endpoint printed by `register`):
   ```json
   "build": {
     "publish": [{ "provider": "generic", "url": "https://updates.davidtechllc.com/<slug>/<app>", "channel": "latest" }],
     "nsis": { "oneClick": true, "perMachine": true }
   }
   ```
3. Wire `autoUpdater.checkForUpdates()` in `main.js`. See §§8–10 of `AUTO_UPDATE_SETUP.md` in the `dukane-cam-viewer` repo for the full UI recipe (predates this CLI but the client-side code is unchanged).

### Rust and Qt

Adapter stubs live at `src/adapters/{rust,qt}.js`. See §§23–24 of `AUTO_UPDATE_SETUP.md` in `dukane-cam-viewer` for the patterns to port. PRs welcome.

---

## CLI reference

```
npm run register  -- <name> --framework=<fw> [--repo=<owner/name>]
npm run publish   -- <name> [tag] [--from=<path>] [--dry-run]
npm run apps                       # list registered apps
npm run slug                       # generate a slug (register does this automatically)
node bin/davidtech-updater.js check-releases [--json]
                                   # compare each app's latest tag vs R2; list
                                   # who needs publishing (--json for CI matrix)
```

You can also invoke the bin directly: `node bin/davidtech-updater.js <command> <args>` — no `--` needed.

### `--dry-run`
Prints every `wrangler r2 object put` command that would execute, without running them. For Tauri, also shows the generated `latest.json`. Use before every real publish until you trust the setup.

---

## What lives where

```
davidtech-updater/
├── apps.json                     The registry — every DavidTech app
├── src/
│   ├── index.js                  Command router
│   ├── registry.js               apps.json load/save/validate
│   ├── config.js                 Shared constants + validators
│   ├── upload.js                 wrangler r2 put wrapper
│   ├── fetch.js                  Download GitHub release assets via gh
│   ├── commands/
│   │   ├── slug.js
│   │   ├── register.js
│   │   └── publish.js
│   └── adapters/
│       ├── electron.js           IMPLEMENTED
│       ├── tauri.js              IMPLEMENTED
│       ├── rust.js               Stub
│       └── qt.js                 Stub
├── worker/                       Cloudflare Worker (already deployed)
│   ├── wrangler.toml
│   └── src/index.js
├── bin/davidtech-updater.js
├── .github/workflows/ci.yml
├── LICENSE
├── package.json
└── README.md
```

---

## Worker (for maintainers only)

The Worker at `updates.davidtechllc.com` is already deployed. **Don't redeploy unless you're changing its behavior.**

```bash
cd worker
wrangler deploy
```

Invariants the Worker enforces:
- Path must be exactly `/<slug>/<app>/<file>`. Anything else → 404.
- `slug` regex: `^[a-z0-9]{8,32}$` (kept in sync with `src/config.js`).
- `app` regex: `^[a-z0-9-]{1,40}$`.
- Extension allowlist covers every framework this CLI supports.
- GET / HEAD only. `range:` header honored.
- Manifests + signatures cached 30s; binaries cached 1h.

---

## Troubleshooting

**"App 'x' not in registry"** — You haven't run `npm run register -- x ...` yet, or you registered it under a different name. Check `npm run apps`.

**Tauri publish: "No .nsis.zip.sig in ..."** — The build didn't see `TAURI_SIGNING_PRIVATE_KEY`. Local: `export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/davidtech_updater.key)"` before running `tauri build`. CI: set it as a repo secret and inject in the build step.

**Tauri publish: "No .nsis.zip in ..."** — `tauri.conf.json` missing `"bundle": { "createUpdaterArtifacts": true, "targets": ["nsis"] }`.

**Electron publish: "latest.yml missing"** — electron-builder ran the portable target, not NSIS. Confirm the `publish` block is configured and the NSIS target is the one running.

**`gh release view` fails** — `gh auth status` to check auth, make sure the token has access to the repo, confirm the tag actually exists on GitHub.

**Wrangler upload fails with auth error** — `wrangler whoami`. If you recently rotated credentials, `wrangler login` again.

**Installed app never sees the update** — Verify the manifest is live:
```bash
curl https://updates.davidtechllc.com/<slug>/<app>/latest.json   # Tauri
curl https://updates.davidtechllc.com/<slug>/<app>/latest.yml    # Electron
```
If it 404s, the publish didn't upload. If it succeeds, check the app's client-side update check is wired correctly.

---

## Migration from inline `publish.js` (cam-viewer, etc.)

For apps currently running their own `scripts/publish.js` against `updates.davidtechllc.com`:

1. In `davidtech-updater`: `npm run register -- cam-viewer --framework=electron --repo=mark2messmore/dukane-cam-viewer` — **but** edit the generated slug in `apps.json` to match the app's existing slug (grep the old `publish.js` for the `SLUG` constant). The R2 path must not change or installed copies stop seeing updates.
2. In the target repo: delete `scripts/publish.js` and remove its npm script.
3. Release via `npm run publish -- cam-viewer --from=<path>` (or GitHub Release tag once the app starts attaching assets).

The Worker serves the same URLs it always has — nothing on the deployed side changes.
