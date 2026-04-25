# davidtech-updater

AI-driven auto-update **control plane** for DavidTech apps. One repo. One registry of every app. One place to ship from. **No CI** — Claude builds locally on the maintainer's machine and uploads directly to Cloudflare R2.

## The shipping workflow

Open this repo in Claude Code. Tell Claude in plain English:

> hey, I updated beam profiler

Claude reads `CLAUDE.md`, looks up `beam-profiler` in `apps.json`, checks the last shipped version in `RELEASES.md`, asks whether to bump (and how), runs `npm run tauri build` in the app's `localPath`, fixes any build errors that come up, signs and uploads to R2, and appends a line to `RELEASES.md`. End-to-end in 5–10 minutes.

That's the entire loop.

The full runbook lives in [`CLAUDE.md`](./CLAUDE.md). It auto-loads when Claude Code opens this repo, so you don't have to memorize commands.

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
  "schemaVersion": 2,
  "apps": {
    "beam-profiler": {
      "slug": "0ex2s23yt30r",
      "framework": "tauri",
      "repo": "mark2messmore/dukane-beam-profiler",
      "localPath": "C:\\Users\\mark2\\Documents\\MyRepos\\dukane-beam-profiler",
      "registeredAt": "2026-04-24T20:19:23.816Z"
    }
  }
}
```

Field meanings:

- **`slug`** — 12-char random, gates the R2 URL. Don't change it after the first ship; installed copies will stop seeing updates.
- **`framework`** — `tauri` / `electron` / `rust` / `qt`. Picks the adapter.
- **`repo`** — optional. GitHub repo for paper-trail / future archaeology. Not required for shipping.
- **`localPath`** — **absolute path to the source on the maintainer's machine.** Required for the AI-driven release flow. Set with `--local=<path>` at register time, or via `set-path` later.

Commit this file. No secrets in here — the slug is visible inside every installed app binary anyway.

---

## Prerequisites

### One-time, on the maintainer's machine

```bash
# Cloudflare R2 + Worker access
wrangler login            # caches OAuth — confirm with 'wrangler whoami'

# For Tauri apps — generate the shared signing key once, reuse forever
npx tauri signer generate -w "$env:USERPROFILE\.tauri\davidtech_updater.key"
```

The pubkey from `davidtech_updater.key.pub` is what goes into every Tauri app's `tauri.conf.json`. The private key signs every `.nsis.zip` during `tauri build`. **Keep it safe** — losing it means every app using its pubkey can never ship another update.

Before each Tauri build, the signing key needs to be in the environment. PowerShell:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content $env:USERPROFILE\.tauri\davidtech_updater.key -Raw)
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""
```

The runbook in `CLAUDE.md` reminds Claude to set these if a build fails on missing signing key.

### Node + build toolchains

- Node 18+
- For Tauri apps: cargo (rustup), MSVC build tools, npm
- For Electron apps: Node + npm

---

## Registering a new app

```bash
node bin/davidtech-updater.js register <name> \
  --framework=<electron|tauri|rust|qt> \
  --repo=<owner/name> \
  --local="<absolute-path-to-source>"
```

Example:

```bash
node bin/davidtech-updater.js register beam-profiler \
  --framework=tauri \
  --repo=mark2messmore/dukane-beam-profiler \
  --local="C:\Users\mark2\Documents\MyRepos\dukane-beam-profiler"
```

`register`:
1. Generates a unique 12-char slug.
2. Appends the entry to `apps.json`.
3. Prints a framework-specific next-steps block — pubkey + endpoint URL to paste into the target app, plus the client-side wiring snippets.

If you forget `--local` at register time, fix it later:

```bash
node bin/davidtech-updater.js set-path beam-profiler "C:\path\to\source"
```

---

## Shipping a release (the explicit, no-AI path)

Most of the time you'll just talk to Claude. But if you want to do it by hand:

```bash
# 1. Bump version in lockstep across the app's three sources of truth
node bin/davidtech-updater.js bump beam-profiler patch

# 2. Build the app locally (in its localPath)
cd <localPath>
npm install
npm run tauri build

# 3. Publish to R2
cd <davidtech-updater repo>
node bin/davidtech-updater.js publish beam-profiler --from=<localPath>

# 4. Verify
curl https://updates.davidtechllc.com/<slug>/beam-profiler/latest.json

# 5. Append to RELEASES.md by hand
```

The AI flow does all five of these for you and asks for confirmation at the bumps and the fix-retries.

---

## CLI reference

```
node bin/davidtech-updater.js apps                                List registered apps + their localPaths
node bin/davidtech-updater.js register <name> --framework=<fw> [--repo=<owner/name>] [--local=<path>]
node bin/davidtech-updater.js set-path  <name> <absolute-path>    Set/update localPath
node bin/davidtech-updater.js bump      <name> <patch|minor|major|x.y.z>
                                                                  Bump version in package.json + Cargo.toml + tauri.conf.json
                                                                  in lockstep, refresh both lockfiles
node bin/davidtech-updater.js publish   <name> --from=<path> [--dry-run]
                                                                  Sign+upload artifacts at <path> to R2
node bin/davidtech-updater.js slug                                Generate a 12-char slug (register does this automatically)
```

`--dry-run` on `publish` prints every `wrangler r2 object put` that would execute (and writes the Tauri manifest to inspect) without uploading.

---

## What lives where

```
davidtech-updater/
├── CLAUDE.md                     The natural-language release runbook (read this first)
├── apps.json                     Registry of every DavidTech app + their localPaths
├── RELEASES.md                   Append-only ship log — last shipped version per app
├── STATUS.md                     This week's project state
├── README.md                     This file
├── src/
│   ├── index.js                  Command router
│   ├── registry.js               apps.json load/save/validate + findApp() fuzzy matcher
│   ├── config.js                 Shared constants + validators
│   ├── upload.js                 wrangler r2 put wrapper
│   ├── fetch.js                  GitHub release-asset downloader (used by --from-less publish)
│   ├── commands/
│   │   ├── slug.js
│   │   ├── register.js
│   │   ├── set-path.js
│   │   ├── bump.js
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
├── LICENSE
└── package.json
```

---

## Framework details

### Tauri v2 — target-app wiring

When `register` runs for a Tauri app, it prints exactly what to paste. Here's the summary:

1. In the target repo:
   ```bash
   cargo add tauri-plugin-updater --features native-tls --manifest-path src-tauri/Cargo.toml
   npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process
   ```
2. Paste into `src-tauri/tauri.conf.json`:
   ```json
   {
     "plugins": {
       "updater": {
         "active": true,
         "pubkey": "<SHARED_DAVIDTECH_PUBKEY>",
         "endpoints": ["https://updates.davidtechllc.com/<slug>/<app>/latest.json"]
       }
     },
     "bundle": { "createUpdaterArtifacts": true }
   }
   ```
3. Add to `src-tauri/capabilities/default.json` permissions: `"updater:default"`, `"process:allow-restart"`, `"dialog:allow-message"`.
4. Register the plugin in `src-tauri/src/lib.rs`:
   ```rust
   .plugin(tauri_plugin_updater::Builder::new().build())
   ```
5. Wire a "Check for updates" button (~5 lines):
   ```ts
   import { check } from '@tauri-apps/plugin-updater';
   import { relaunch } from '@tauri-apps/plugin-process';

   const update = await check();
   if (update?.available) {
     await update.downloadAndInstall();
     await relaunch();
   }
   ```

Release notes: if `RELEASE_NOTES.md` / `.txt` / `NOTES.md` exists at the project root, its contents become the manifest's `notes` field.

### Electron — target-app wiring

1. Install `electron-updater` in the target app.
2. Configure electron-builder publish:
   ```json
   "build": {
     "publish": [{ "provider": "generic", "url": "https://updates.davidtechllc.com/<slug>/<app>", "channel": "latest" }],
     "nsis": { "oneClick": true, "perMachine": true }
   }
   ```
3. Wire `autoUpdater.checkForUpdates()` in `main.js`.

### Rust and Qt

Adapter stubs at `src/adapters/{rust,qt}.js`. Build out when there's a real app that needs them.

---

## Worker (for maintainers only)

The Worker at `updates.davidtechllc.com` is already deployed. **Don't redeploy unless you're changing its behavior.**

```bash
cd worker
wrangler deploy
```

Invariants:
- Path must be exactly `/<slug>/<app>/<file>`. Anything else → 404.
- `slug` regex: `^[a-z0-9]{8,32}$` (kept in sync with `src/config.js`).
- `app` regex: `^[a-z0-9-]{1,40}$`.
- Missing `latest.json` → 204 No Content (Tauri's "client up to date" response).
- Missing `latest.yml` → 404 (electron-updater's expected "no update" response).
- GET / HEAD only. `range:` header honored.
- Manifests + signatures cached 30s; binaries cached 1h.

---

## Troubleshooting

**Build fails with "Found version mismatched Tauri packages"** — Cargo.lock pinned the Rust crate at an older minor than what npm resolved. Run `cargo update -p tauri-plugin-<name>` in the app's `src-tauri/` and retry.

**Build fails with "no signing private key"** — Set `TAURI_SIGNING_PRIVATE_KEY` (and `_PASSWORD` if applicable) in the shell before `npm run tauri build`. See Prerequisites above.

**`publish` fails with "No .nsis.zip in ..."** — `tauri.conf.json` is missing `"bundle": { "createUpdaterArtifacts": true }`.

**Wrangler upload fails with auth error** — `wrangler whoami` to check, `wrangler login` if needed.

**Installed app never sees the update** — Verify the manifest is live:
```bash
curl https://updates.davidtechllc.com/<slug>/<app>/latest.json   # Tauri
curl https://updates.davidtechllc.com/<slug>/<app>/latest.yml    # Electron
```
If it 404s, the publish didn't upload. If the version looks right, the client-side update check in the app may not be wired correctly.

---

## Migration from inline `publish.js` (cam-viewer, etc.)

For apps currently running their own `scripts/publish.js` against `updates.davidtechllc.com`:

1. In this repo: register the app — but **edit the generated slug in `apps.json` to match the app's existing slug** (grep the old `publish.js` for the `SLUG` constant). The R2 path must not change or installed copies stop seeing updates.
2. In the target repo: delete `scripts/publish.js` and remove its npm script.
3. Release via the AI flow: "hey I updated cam viewer" — Claude takes it from there.
