import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { getApp } from '../registry.js';

const USAGE = `
Usage:
  build <app> [--skip-install]

Runs the local production build for an app. For Tauri apps:
  - Reads the signing key from %USERPROFILE%/.tauri/davidtech_updater.key
  - Runs 'npm install' (unless --skip-install)
  - Runs 'npm run tauri build' with the signing env vars set
  - Verifies .nsis.zip + .nsis.zip.sig landed in the bundle dir

The signing key is read automatically every build — never asked about. If
the key file is missing this command fails loudly. Never set the key
manually in your shell.
`.trim();

const KEY_PATH = path.join(os.homedir(), '.tauri', 'davidtech_updater.key');

export async function buildCommand(args) {
  const { positional, flags } = parseArgs(args);
  const [name] = positional;

  if (!name) {
    console.error(`Missing app name.\n\n${USAGE}`);
    process.exit(2);
  }

  const app = getApp(name);
  if (!app.localPath) {
    throw new Error(
      `App "${name}" has no localPath — set with 'set-path ${name} <path>' first`
    );
  }
  if (!fs.existsSync(app.localPath)) {
    throw new Error(`localPath does not exist: ${app.localPath}`);
  }

  if (app.framework === 'tauri') {
    return buildTauri({ app, name, skipInstall: Boolean(flags['skip-install']) });
  }
  if (app.framework === 'electron') {
    return buildElectron({ app, name, skipInstall: Boolean(flags['skip-install']) });
  }
  throw new Error(
    `build is only implemented for tauri/electron right now (got: ${app.framework})`
  );
}

function buildTauri({ app, name, skipInstall }) {
  const root = app.localPath;
  const key = readSigningKey();

  if (!skipInstall) {
    console.log(`\n[1/3] npm install (in ${root})`);
    runOrThrow('npm', ['install', '--silent'], { cwd: root });
  } else {
    console.log(`[1/3] skipping npm install (--skip-install)`);
  }

  console.log(`\n[2/3] npm run tauri build (in ${root})`);
  console.log(`      TAURI_SIGNING_PRIVATE_KEY: <loaded from ${KEY_PATH}, ${key.length} chars>`);
  runOrThrow('npm', ['run', 'tauri', 'build'], {
    cwd: root,
    env: {
      ...process.env,
      TAURI_SIGNING_PRIVATE_KEY: key,
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '',
    },
  });

  console.log(`\n[3/3] verifying artifacts`);
  const bundleDir = path.join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
  if (!fs.existsSync(bundleDir)) {
    throw new Error(`Build completed but ${bundleDir} does not exist`);
  }
  const entries = fs.readdirSync(bundleDir);
  const zip = entries.find((f) => f.endsWith('.nsis.zip'));
  const sig = entries.find((f) => f.endsWith('.nsis.zip.sig'));
  if (!zip || !sig) {
    throw new Error(
      `Bundle dir is missing updater artifacts (.nsis.zip + .nsis.zip.sig).\n` +
        `Found: ${entries.join(', ') || '(empty)'}\n` +
        `Confirm tauri.conf.json has bundle.createUpdaterArtifacts=true.`
    );
  }
  console.log(`      ✓ ${zip}`);
  console.log(`      ✓ ${sig}`);
  console.log(`\n✅ Build complete. Next: 'publish ${name}'`);
}

function buildElectron({ app, name, skipInstall }) {
  const root = app.localPath;

  if (!skipInstall) {
    console.log(`\n[1/2] npm install (in ${root})`);
    runOrThrow('npm', ['install', '--silent'], { cwd: root });
  }
  console.log(`\n[2/2] npm run build:install (in ${root})`);
  runOrThrow('npm', ['run', 'build:install'], { cwd: root });

  const distDir = path.join(root, 'dist');
  if (!fs.existsSync(distDir)) {
    throw new Error(`Build completed but ${distDir} does not exist`);
  }
  console.log(`\n✅ Build complete. Next: 'publish ${name}'`);
}

function readSigningKey() {
  if (!fs.existsSync(KEY_PATH)) {
    throw new Error(
      `Tauri signing key not found at ${KEY_PATH}.\n` +
        `Generate it once with:\n` +
        `  npx tauri signer generate -w "${KEY_PATH}"\n` +
        `…or copy the existing key from another machine. The corresponding pubkey ` +
        `is baked into every DavidTech app's tauri.conf.json.`
    );
  }
  return fs.readFileSync(KEY_PATH, 'utf8');
}

function runOrThrow(cmd, args, opts) {
  // Windows needs shell:true for npm.cmd / cargo.exe to resolve correctly
  // through PATH. Inheriting stdio so the user sees build output live.
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited with code ${result.status}`);
  }
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
