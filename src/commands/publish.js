import fs from 'node:fs';
import path from 'node:path';
import { UPDATE_DOMAIN } from '../config.js';
import { getApp } from '../registry.js';
import {
  fetchReleaseAssets,
  latestReleaseTag,
  releaseBody,
  tagToVersion,
} from '../fetch.js';
import { publishElectron } from '../adapters/electron.js';
import { publishTauri } from '../adapters/tauri.js';
import { publishRust } from '../adapters/rust.js';
import { publishQt } from '../adapters/qt.js';

const ADAPTERS = {
  electron: publishElectron,
  tauri: publishTauri,
  rust: publishRust,
  qt: publishQt,
};

const USAGE = `
Usage:
  npm run publish -- <name> [tag] [--dry-run] [--from=<local-path>]

Examples:
  npm run publish -- beam-profiler                   Latest GitHub release
  npm run publish -- beam-profiler v1.2.0            Specific tag
  npm run publish -- beam-profiler --from=../beam    Local build (skips GitHub)
  npm run publish -- beam-profiler v1.2.0 --dry-run  Show commands without running
`.trim();

export async function publishCommand(args) {
  const { positional, flags } = parseArgs(args);
  const [name, maybeTag] = positional;

  if (!name) {
    console.error(`Missing app name.\n\n${USAGE}`);
    process.exit(2);
  }

  const app = getApp(name);
  const dryRun = Boolean(flags['dry-run']);
  // --from explicit override; otherwise fall back to the registered localPath.
  // The AI runbook never passes --from since localPath is in apps.json.
  const fromLocal = flags.from
    ? path.resolve(flags.from)
    : app.localPath
    ? path.resolve(app.localPath)
    : null;

  let artifactsDir;
  let version;
  let notes;
  let cleanup = null;

  if (fromLocal) {
    // Local build path — no GitHub involved. The adapter derives artifactsDir
    // from the project root (e.g. Tauri → <root>/src-tauri/target/release/bundle/nsis).
    const resolved = resolveLocalArtifacts({ app, root: fromLocal });
    artifactsDir = resolved.artifactsDir;
    version = resolved.version;
    notes = resolved.notes;
  } else {
    if (!app.repo) {
      throw new Error(
        `App "${name}" has no 'repo' in apps.json — either add one or pass --from=<path>`
      );
    }
    const tag = maybeTag ?? latestReleaseTag(app.repo);
    console.log(`Fetching ${app.repo}@${tag}...`);
    artifactsDir = fetchReleaseAssets({ repo: app.repo, tag, framework: app.framework });
    version = tagToVersion(tag);
    notes = releaseBody(app.repo, tag) ?? `Version ${version}`;
    cleanup = () => fs.rmSync(artifactsDir, { recursive: true, force: true });
  }

  const ctx = {
    slug: app.slug,
    app: name,
    framework: app.framework,
    version,
    notes,
    artifactsDir,
    dryRun,
  };

  console.log(
    `Publishing ${name} v${version} via ${app.framework} adapter${dryRun ? ' [DRY RUN]' : ''}`
  );

  try {
    await ADAPTERS[app.framework](ctx);
    console.log(
      `\n✅ Published — live at https://${UPDATE_DOMAIN}/${app.slug}/${name}/`
    );
  } finally {
    cleanup?.();
  }
}

// Resolve local-build artifacts — figures out where each framework puts its
// bundle output relative to a project root, and reads the version from the
// project's own source of truth.
function resolveLocalArtifacts({ app, root }) {
  if (!fs.existsSync(root)) {
    throw new Error(`--from path does not exist: ${root}`);
  }

  if (app.framework === 'tauri') {
    const artifactsDir = path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
    if (!fs.existsSync(artifactsDir)) {
      throw new Error(
        `No ${artifactsDir} — run 'npm run tauri build' in ${root} first.\n` +
          `Also confirm tauri.conf.json has bundle.createUpdaterArtifacts=true.`
      );
    }
    return {
      artifactsDir,
      version: readTauriVersion(root),
      notes: readLocalNotes(root),
    };
  }

  if (app.framework === 'electron') {
    const artifactsDir = path.join(root, 'dist');
    if (!fs.existsSync(artifactsDir)) {
      throw new Error(
        `No ${artifactsDir} — run your electron-builder NSIS build in ${root} first.`
      );
    }
    // Electron's latest.yml carries the version — we don't need to compute it.
    return { artifactsDir, version: readPackageJsonVersion(root), notes: null };
  }

  throw new Error(`Local --from is not yet supported for framework "${app.framework}"`);
}

function readTauriVersion(root) {
  const conf = path.join(root, 'src-tauri', 'tauri.conf.json');
  if (fs.existsSync(conf)) {
    const v = JSON.parse(fs.readFileSync(conf, 'utf8')).version;
    if (v) return v;
  }
  return readPackageJsonVersion(root);
}

function readPackageJsonVersion(root) {
  const pkg = path.join(root, 'package.json');
  if (fs.existsSync(pkg)) {
    const v = JSON.parse(fs.readFileSync(pkg, 'utf8')).version;
    if (v) return v;
  }
  throw new Error(`Could not determine version from ${root}`);
}

function readLocalNotes(root) {
  for (const name of ['RELEASE_NOTES.md', 'RELEASE_NOTES.txt', 'NOTES.md']) {
    const p = path.join(root, name);
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  }
  return null;
}

function parseArgs(args) {
  const positional = [];
  const flags = {};
  for (const a of args) {
    if (a.startsWith('--')) {
      const [k, ...v] = a.slice(2).split('=');
      flags[k] = v.length > 0 ? v.join('=') : true;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}
