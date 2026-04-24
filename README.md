# davidtech-updater

Shared auto-update tooling for DavidTech apps. One CLI that knows how to generate the right update manifest for Electron, Tauri, native Rust, or Qt builds and upload everything to the shared Cloudflare R2 bucket behind `updates.davidtechllc.com`.

The infrastructure is already live. This repo is **(a)** the Worker source and **(b)** the publish CLI that every DavidTech app installs as a dev dependency.

---

## What's already running (do not recreate)

| Resource | Name / URL |
|---|---|
| R2 bucket | `davidtech-app-updates` |
| Cloudflare Worker | `davidtech-update-worker` at `updates.davidtechllc.com` |
| Cloudflare account | `mark2messmore@gmail.com` (account ID `54899a88ce46b4d2344e8dbfe69c6c9c`) |
| URL shape | `https://updates.davidtechllc.com/<slug>/<app>/<file>` |

The `<slug>` is a 12-char random alphanumeric string, one per app. It gates casual URL scraping — not security-critical, but every app gets a unique one.

---

## Install in a new app

```bash
npm install -D github:mark2messmore/davidtech-updater#v0.1.0
npx davidtech-updater init
```

`init` writes `davidtech.config.json`:

```json
{
  "slug": "q3k2m8p9x7h1",
  "app": "widget-tracker",
  "framework": "electron"
}
```

Edit `framework` to match your app. Then wire the per-framework client (§[Electron](#electron-wiring) / §[Tauri](#tauri-wiring) below).

In CI, after your build step:

```bash
npx davidtech-updater publish
```

Done. Installers land at `updates.davidtechllc.com/<slug>/<app>/` and any installed copy of the app sees the new version on its next poll.

---

## CLI reference

```
davidtech-updater <command> [options]

  slug                 Generate a new 12-char slug
  init                 Scaffold davidtech.config.json in the current directory
  publish [--dry-run]  Build manifest and upload artifacts to R2
```

`publish` reads `./davidtech.config.json` and dispatches to the adapter for the configured framework. `--dry-run` prints every `wrangler r2 object put` it would execute without running them — use it to verify filenames before a real release.

**Env required for publish:**

| Variable | Purpose |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Scoped to R2 write on `davidtech-app-updates`. Set as a GitHub Actions secret. |

`wrangler` picks up the token automatically — no other config needed.

---

## Config file — `davidtech.config.json`

```json
{
  "slug": "q3k2m8p9x7h1",
  "app": "widget-tracker",
  "framework": "electron"
}
```

- **`slug`** — 8–32 chars `[a-z0-9]`. One per app, never reused. Generate with `npx davidtech-updater slug`.
- **`app`** — 1–40 chars `[a-z0-9-]`. Appears in the URL; keep it short and recognizable.
- **`framework`** — one of `electron`, `tauri`, `rust`, `qt`. Picks the adapter.

Commit this file. It contains no secrets — the slug is visible in the installed app anyway.

---

## Electron wiring

1. Configure `electron-builder` to emit the generic publish block:
   ```json
   "build": {
     "publish": [{
       "provider": "generic",
       "url": "https://updates.davidtechllc.com/<SLUG>/<APP>",
       "channel": "latest"
     }],
     "nsis": { "oneClick": true, "perMachine": true }
   }
   ```
2. Install `electron-updater` and wire `autoUpdater.checkForUpdates()` in `main.js`.
3. In CI, after your NSIS build:
   ```bash
   npx davidtech-updater publish
   ```

The adapter uploads `dist/latest.yml`, `dist/*.exe`, and `dist/*.blockmap`. `electron-builder` generates `latest.yml` itself — we just ship it.

See §§4–16 of `AUTO_UPDATE_SETUP.md` in the `dukane-cam-viewer` repo for full per-app Electron wiring (`main.js`, `preload.js`, renderer UI, `installer.nsh`).

---

## Tauri wiring

Tauri v2 has mandatory Ed25519 signature verification and its own manifest format.

1. One-time per org: generate a signing key. Same key works across every Tauri app.
   ```bash
   tauri signer generate -w ~/.tauri/davidtech_updater.key
   ```
   Store the private key in GitHub Actions secrets as `TAURI_SIGNING_PRIVATE_KEY` (plus `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if you encrypted it).

2. Add the plugin:
   ```bash
   cargo add tauri-plugin-updater --features native-tls --manifest-path src-tauri/Cargo.toml
   npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process
   ```

3. Configure `tauri.conf.json`:
   ```json
   {
     "plugins": {
       "updater": {
         "active": true,
         "dialog": false,
         "pubkey": "<SHARED_DAVIDTECH_PUBKEY>",
         "endpoints": [
           "https://updates.davidtechllc.com/<SLUG>/<APP>/latest.json"
         ]
       }
     },
     "bundle": {
       "createUpdaterArtifacts": true,
       "targets": ["nsis"]
     }
   }
   ```

4. Register the plugin in `src-tauri/src/lib.rs`:
   ```rust
   .plugin(tauri_plugin_updater::Builder::new().build())
   ```

5. Wire a "Check for updates" button in the frontend — ~5 lines:
   ```ts
   import { check } from '@tauri-apps/plugin-updater';
   import { relaunch } from '@tauri-apps/plugin-process';

   const update = await check();
   if (update?.available) {
     await update.downloadAndInstall();
     await relaunch();
   }
   ```

6. In CI, after `tauri build`:
   ```bash
   npx davidtech-updater publish
   ```

The adapter generates `latest.json` (inlining the signature from the `.sig` file) and uploads `.nsis.zip` + `.sig` + `latest.json` to R2.

**Release notes:** if `RELEASE_NOTES.md`, `RELEASE_NOTES.txt`, or `NOTES.md` exists in the repo root, its contents go into the manifest's `notes` field. Otherwise `notes` is `"Version <x.y.z>"`.

---

## Rust (Slint, egui, iced, Dioxus, GPUI) — adapter not yet implemented

Stub present at `src/adapters/rust.js`. See §23 of `AUTO_UPDATE_SETUP.md` (in the `dukane-cam-viewer` repo) for the `self_update`-based pattern. PRs welcome.

## Qt / QtIFW — adapter not yet implemented

Stub present at `src/adapters/qt.js`. See §24 of the same doc. PRs welcome.

---

## CI integration — GitHub Actions example

### Electron

```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm run build:install
      - run: npx davidtech-updater publish
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

### Tauri

```yaml
name: Release
on:
  push:
    tags: ['v*']

jobs:
  release:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - uses: dtolnay/rust-toolchain@stable
      - run: npm ci
      - run: npm run tauri build
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
      - run: npx davidtech-updater publish
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

---

## Worker (for maintainers only)

The Worker source lives in `worker/`. It's already deployed — **don't redeploy unless you're changing its behavior.**

To make changes:

```bash
cd worker
wrangler deploy
```

Deploy auth comes from `wrangler login` on the maintainer's machine. The R2 binding (`BUCKET` → `davidtech-app-updates`) and the custom-domain route (`updates.davidtechllc.com`) are both declared in `wrangler.toml`.

**Invariants the Worker enforces:**
- Path must be exactly `/<slug>/<app>/<file>` (3 segments). Everything else → 404.
- `slug` regex: `^[a-z0-9]{8,32}$`.
- `app` regex: `^[a-z0-9-]{1,40}$`.
- Extension allowlist covers every framework this CLI supports.
- GET / HEAD only. `range:` header honored for resumable downloads.
- Manifests (`.yml`/`.json`/`.xml`) and signatures get a 30-second cache; binaries get 1 hour.

Keep the regexes in sync with `src/config.js` — the CLI validates the same shape client-side so misconfigured apps fail fast instead of hitting a live 404.

---

## Troubleshooting

**`npx davidtech-updater publish` says `./dist not found`** — Electron adapter. Your build didn't emit the NSIS artifacts. Confirm `electron-builder` ran the NSIS target (not portable) and that `package.json` has a `publish` block pointing at `updates.davidtechllc.com`.

**Tauri publish says "No .nsis.zip.sig in ..."** — Signing key not passed to `tauri build`. Set `TAURI_SIGNING_PRIVATE_KEY` in the environment before the build step (and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` if it's encrypted).

**Tauri publish says "No .nsis.zip in ..."** — `tauri.conf.json` missing `"bundle": { "createUpdaterArtifacts": true }`. Add it and rebuild.

**`wrangler` fails with authentication error in CI** — Missing or misscoped `CLOUDFLARE_API_TOKEN`. The token needs R2 write permission on the `davidtech-app-updates` bucket specifically (don't use an all-account token for CI).

**An installed app never sees the update** — Verify the manifest is live:
```bash
curl https://updates.davidtechllc.com/<slug>/<app>/latest.yml   # or latest.json for Tauri
```
If that 404s, publish didn't upload correctly. If it succeeds, check the app's client-side update check is wired and running.

---

## Migration from inline `publish.js`

The original `dukane-cam-viewer` repo has a 44-line `scripts/publish.js` that predates this CLI. Migration is 3 steps:

1. `npm install -D github:mark2messmore/davidtech-updater`
2. Delete `scripts/publish.js` and replace with `npx davidtech-updater init` + edit the slug/app in the generated config to match the existing upload path.
3. Change `package.json` `"publish"` script to `"davidtech-updater publish"`.

The existing Worker accepts the same URLs it always has — there's no change on the deployed side.
