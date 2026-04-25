# CLAUDE.md

Guidance to Claude Code when working in this repository.

`README.md` is the user-facing doc. `STATUS.md` is what's happening this week. This file is for *how Claude operates inside this repo* — both the architecture and the conversational release runbook.

---

## How this repo works (in one paragraph)

`davidtech-updater` is the **release control center** for every DavidTech app. The maintainer (Mark) develops apps in their own repos like normal. When it's time to ship, he opens *this* repo and tells Claude in plain English: "hey I updated beam profiler" / "ship the laser thing" / "push beam-profiler 1.3". Claude reads this file, follows the runbook below, runs the local build on Mark's machine, fixes any errors that come up, signs and uploads the artifacts to Cloudflare R2 via wrangler, and appends a line to `RELEASES.md`. **There is no CI.** GitHub is just code hosting. The Cloudflare Worker at `updates.davidtechllc.com` serves the manifest; that's the only piece running outside the maintainer's machine.

---

## ⚡ Release runbook — the natural-language flow

When the user opens this repo and says **anything that mentions an app + a release/update/ship/push/publish/version intent**, treat it as a release request and follow this runbook. Examples that should trigger it:

- "hey, I updated beam profiler"
- "ship beam profiler"
- "push the laser app"
- "release beam-profiler 1.3.0"
- "let's get beam profiler out"
- "I need a new build of beam profiler"

### Step 1 — Identify the app

Read `apps.json`. Use `findApp()` from `src/registry.js` (or just fuzzy-match by hand) to map the user's wording to a canonical registry key. "beam profiler" / "beamprofiler" / "BEAM" / "beam" all → `beam-profiler`.

If the match is ambiguous (multiple registered apps could match) or there's no match, **ask the user which app they mean** and list the registered ones from `npm run apps`.

### Step 2 — Read the state

Three numbers matter:

| Where | What it tells you |
|---|---|
| `RELEASES.md` (last entry for this app) | The last version successfully shipped to R2 |
| `<localPath>/src-tauri/tauri.conf.json` `.version` | The current source version |
| `https://updates.davidtechllc.com/<slug>/<app>/latest.json` (HEAD or curl) | What clients see right now |

Read all three. Compare them. Common cases:

- **Source version > last shipped** — the maintainer already bumped the version (typically because they were mid-fix). Ask: *"Source is at X.Y.Z, last ship was A.B.C. Ship X.Y.Z as-is, or bump first?"*
- **Source version == last shipped** — they just made changes without bumping. Ask what to do: *"Source is still A.B.C (last ship). Bump to (A.B.C+1) patch, or something else?"*
- **No prior ship in RELEASES.md** — first release. Ask: *"First ship for this app — go with current source version X.Y.Z, or bump first?"*

Always **ask** before bumping. Never auto-bump.

### Step 3 — Bump (if needed)

When the user confirms a bump, use the CLI:

```bash
node bin/davidtech-updater.js bump <app> <patch|minor|major|x.y.z>
```

This rewrites `package.json` + `src-tauri/tauri.conf.json` + `src-tauri/Cargo.toml` in lockstep and refreshes both lockfiles. Don't hand-edit the version files — the bump command handles edge cases (Cargo.toml has nested dependency versions; tauri.conf.json may have plugin schemas with their own version fields) that a naive replace would break.

### Step 4 — Build locally

```bash
node bin/davidtech-updater.js build <app>
```

That's it. **Don't run `npm run tauri build` directly. Don't ask the user about the signing key. Don't tell the user to export env vars.** The `build` command:

- Reads the signing key from `%USERPROFILE%\.tauri\davidtech_updater.key` (the only place it ever lives) and passes it to the build as `TAURI_SIGNING_PRIVATE_KEY`
- Resolves `localPath` from `apps.json` automatically
- Runs `npm install` then `npm run tauri build` in that directory
- Verifies `.nsis.zip` + `.nsis.zip.sig` landed in the bundle dir before returning success

Takes 3–8 minutes on a warm cargo cache. The signing key path is fixed; the password is empty; the maintainer's machine has both. **There is nothing for the user to confirm here.** If the key file is genuinely missing, the command fails loudly with "Tauri signing key not found at ..." — only then escalate to the user.

Add `--skip-install` if you've already run `npm install` in this session and `package-lock.json` hasn't changed (saves ~30s).

### Step 5 — Fix-and-retry loop on build failure

If the build fails, **read the actual error output**, identify the cause, propose a fix, ask the user if they want to apply it, then retry. This is the human-in-the-loop part — don't auto-apply non-trivial code changes. Common failure patterns we've already seen:

| Symptom | Cause | Fix |
|---|---|---|
| `Found version mismatched Tauri packages: tauri-plugin-X (vM.N) : @tauri-apps/plugin-X (vM.N+1)` | Cargo.lock pinned the Rust crate at an older minor than npm resolved | `cargo update -p tauri-plugin-X` in `<localPath>/src-tauri`, then retry |
| `Tauri signing key not found at <path>` | Key file missing on this machine | **Stop.** Tell the user the key is missing — don't try to recover. They need to copy it from another machine or regenerate (which would invalidate every shipped pubkey). |
| `failed to read signing key` mid-build | Should never happen — `build` already loaded it before spawn | Surface to user, don't loop |
| Rust compile error in app code | Real bug in the app | Open the file, propose the fix, ask before applying |

If the same error fires twice, **stop and surface it to the user**. Don't loop blindly.

### Step 6 — Publish to R2

```bash
node bin/davidtech-updater.js publish <app>
```

`publish` defaults to the registered `localPath` — no `--from` needed. Reads artifacts from `<localPath>/src-tauri/target/release/bundle/nsis/`, generates `latest.json` inlining the Ed25519 signature from the `.sig` file, uploads `.nsis.zip` + `.sig` + `latest.json` to R2 via `npx wrangler r2 object put`. Watch for the `✅ Published — live at https://...` line.

### Step 7 — Verify it landed

```bash
curl -s https://updates.davidtechllc.com/<slug>/<app>/latest.json
```

Confirm the `version` field matches what we just shipped. If the Worker returns 404 or stale JSON, R2 propagation is usually < 5 seconds — wait and retry once before assuming a problem.

### Step 8 — Append to RELEASES.md

Edit `RELEASES.md`. Add a line under the app's section in the format:

```
- YYYY-MM-DD — vX.Y.Z — <one-line summary of what changed>
```

If the app section doesn't exist yet, create one (alphabetical order). Use today's date in ISO format.

### Step 9 — Tag the source repo (optional but recommended)

Ask the user if they want to commit + tag the bumped versions in the target repo. If yes:

```bash
cd <localPath>
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json
git commit -m "vX.Y.Z — <short description>"
git tag vX.Y.Z
git push origin <main-branch>
git push origin vX.Y.Z
```

The git tag is **purely a paper trail** now — nothing on the auto-update side keys off it. But it's still useful for "what code shipped as 1.2.1?" archaeology.

### Step 10 — Done

Tell the user the URL of the manifest and remind them to test the upgrade if this is a flow they care about validating. End of runbook.

---

## Architecture

### The control plane has three moving parts

1. **CLI** (this repo: `src/`, `bin/`) — JS ESM, zero runtime deps. Adapters in `src/adapters/` are framework-specific. Commands dispatch through `src/index.js`.
2. **Cloudflare Worker** (`worker/`) at `updates.davidtechllc.com` — already deployed. Path-gates `/<slug>/<app>/<file>` through an allowlist regex, proxies the R2 bucket. Single file, custom domain.
3. **R2 bucket** (`davidtech-app-updates`) — dumb storage. Objects keyed `<slug>/<app>/<file>`.

All three share one invariant: the `slug` / `app` / `filename` regexes in `worker/src/index.js` **must match** `SLUG_RE` / `APP_RE` and the content-type table in `src/config.js` + `src/upload.js`. Drift means the CLI will happily upload files the Worker then 404s on. When you change one, change the other in the same commit.

### apps.json is the registry

Every app has:
- `slug` — 12-char random, gates the R2 URL (don't change after first ship)
- `framework` — picks the adapter (`tauri` / `electron` / `rust` / `qt`)
- `repo` — optional, GitHub repo for documentation / paper trail
- `localPath` — **absolute path to the app's source on the maintainer's machine** (this is what enables the AI-driven local-build flow)

The schema is at `schemaVersion: 2` (1 had no `localPath`). Bump the schema version when adding required fields.

### Build happens locally

There is no GitHub Actions workflow. There is no CI runner. The maintainer's Windows machine has cargo, MSVC, Node, and the Tauri signing key — that's the build environment, full stop. This is a deliberate choice:

- **Faster** — no cold `npm ci`, no cold cargo registry fetch, no checkout-target-repo dance, no PAT juggling.
- **Easier to debug** — build errors show in the same terminal where the AI is sitting; fixes go in immediately and retry.
- **Fewer secrets** — no `DAVIDTECH_REPO_TOKEN`, no PAT rotation, no GitHub repo secrets to keep in sync.

Tradeoff: builds are tied to the maintainer's machine state. If a release needs to ship while Mark is on a plane, that's a problem we'll solve when we hit it (re-add a workflow, run a build VM somewhere). Until then, simpler is better.

### Publish flow (`publish` command)

`publish <name> --from=<path>` is what the runbook calls in step 6:

1. Look up `<name>` in `apps.json`.
2. Resolve artifacts — the adapter derives the build-output subdir from the project root (Tauri → `<root>/src-tauri/target/release/bundle/nsis`). Version comes from `tauri.conf.json`. Release notes come from `RELEASE_NOTES.md` / `.txt` / `NOTES.md` at the root if present.
3. Dispatch to the framework adapter. Tauri's adapter generates `latest.json` inlining the signature from the `.sig` file.
4. Adapter calls `upload.js` which shells out to `npx wrangler r2 object put`.

Adapters **never touch `cwd`** — everything they need comes in via the ctx object. This keeps each adapter independent and testable.

### Framework adapters

- `tauri.js` — implemented. Generates `latest.json` inlining signature. Uploads `.nsis.zip` + `.sig` + `latest.json`.
- `electron.js` — implemented. Uploads `latest.yml` + `*.exe` + `*.blockmap`.
- `rust.js`, `qt.js` — stubs. Add adapters here, don't branch on framework anywhere else.

If you add a framework, the diff is exactly: one new file in `src/adapters/`, one import in `src/commands/publish.js`'s `ADAPTERS` map, one pattern set in `src/fetch.js`'s `PATTERNS_BY_FRAMEWORK`, and an `assertFramework` regex update if the framework name is new.

---

## Signing

The Ed25519 keypair lives at `%USERPROFILE%\.tauri\davidtech_updater.key` (private) and `%USERPROFILE%\.tauri\davidtech_updater.key.pub` (public). The pubkey is baked into every app's `tauri.conf.json`. The private key signs the `.nsis.zip` during the build.

**The `build` command reads this file automatically every run.** You (Claude) never set env vars in the user's shell. You never ask the user about the key. You never print the key contents. The path is fixed; the password is empty; the only failure mode is "file genuinely missing" — and in that case you stop and surface to the user, you don't try to recover (regenerating the keypair would invalidate the pubkey baked into every shipped app, breaking auto-updates forever).

**Never copy the private key into a repo, an env file, an Action secret, or anywhere else.** It signs every DavidTech app's auto-updates. Compromise = arbitrary code execution on every installed app on every customer machine.

---

## Conventions

- **Worker regex must match CLI validators.** `src/config.js` has `SLUG_RE` / `APP_RE` — these are the source of truth. `worker/src/index.js` repeats them inline (Workers can't import from this CLI). When you change one, change the other in the same commit.
- **Adapters are pure over `ctx`.** No `process.cwd()` reads, no `fs.existsSync` walks outside of `artifactsDir`. All resolution happens in `publish.js`'s `resolveLocalArtifacts`.
- **No runtime dependencies.** `peerDependencies.wrangler` is optional — `upload.js` shells out to `npx wrangler` so npx will fetch it if absent. Same for `gh` (if used). Don't add `commander` / `yargs` / `chalk`.
- **Exit codes matter.** Validation failures exit `2` (bad invocation). Runtime failures exit `1`. Don't swallow errors — the runbook reads exit codes to decide whether to continue.
- **Don't hand-edit `apps.json` unless you know why.** Use `register` for new apps and `set-path` to update `localPath`. The validators catch malformed entries before they hit disk.

---

## Versioning of *this* repo

Bump `package.json.version`, commit, tag `vX.Y.Z`, push. Currently at `v0.4.0` (the AI-driven refactor that removed CI). Breaking CLI-shape changes warrant a minor bump while still in `0.x`, major after `1.0`.
