import fs from 'node:fs';
import path from 'node:path';
import { getApp } from '../registry.js';

const USAGE = `
Usage:
  bump <app> <patch|minor|major|x.y.z>

Bumps the version in lockstep across the app's three sources of truth:
  - package.json
  - src-tauri/tauri.conf.json
  - src-tauri/Cargo.toml

The app must have 'localPath' set in apps.json.

Examples:
  bump beam-profiler patch              1.2.1 → 1.2.2
  bump beam-profiler minor              1.2.1 → 1.3.0
  bump beam-profiler 2.0.0              explicit version
`.trim();

export function bumpCommand(args) {
  const [name, levelOrVersion] = args;

  if (!name || !levelOrVersion) {
    console.error(`Missing arguments.\n\n${USAGE}`);
    process.exit(2);
  }

  const app = getApp(name);
  if (!app.localPath) {
    throw new Error(
      `App "${name}" has no localPath in apps.json — bump only works for local-build apps. ` +
        `Add localPath to apps.json or pass it via 'register' / 'set-path'.`
    );
  }
  if (app.framework !== 'tauri') {
    throw new Error(
      `bump is only implemented for tauri apps right now (got: ${app.framework}). ` +
        `Add electron/rust/qt branches in src/commands/bump.js when needed.`
    );
  }

  const root = app.localPath;
  if (!fs.existsSync(root)) {
    throw new Error(
      `localPath does not exist on this machine: ${root}\n` +
        `Edit apps.json or set the right path with 'set-path ${name} <path>'.`
    );
  }

  const current = readTauriVersion(root);
  const next = resolveNext(current, levelOrVersion);
  if (next === current) {
    console.log(`Version unchanged (${current}). Nothing to do.`);
    return { app: name, current, next };
  }

  console.log(`Bumping ${name}: ${current} → ${next}`);
  writeJsonVersion(path.join(root, 'package.json'), next);
  writeJsonVersion(path.join(root, 'src-tauri', 'tauri.conf.json'), next);
  writeCargoTomlVersion(path.join(root, 'src-tauri', 'Cargo.toml'), next);
  refreshNpmLock(root);
  refreshCargoLock(root);

  console.log(`✓ Bumped to ${next} in package.json, tauri.conf.json, Cargo.toml.`);
  console.log(`  Lockfiles refreshed. Ready to build.`);
  return { app: name, current, next };
}

function readTauriVersion(root) {
  const conf = path.join(root, 'src-tauri', 'tauri.conf.json');
  if (fs.existsSync(conf)) {
    const v = JSON.parse(fs.readFileSync(conf, 'utf8')).version;
    if (v) return v;
  }
  const pkg = path.join(root, 'package.json');
  if (fs.existsSync(pkg)) {
    const v = JSON.parse(fs.readFileSync(pkg, 'utf8')).version;
    if (v) return v;
  }
  throw new Error(`Could not read current version from ${root}`);
}

// Accepts "patch" | "minor" | "major" | "x.y.z". No prerelease suffix support —
// DavidTech apps ship plain SemVer.
function resolveNext(current, input) {
  if (/^\d+\.\d+\.\d+$/.test(input)) return input;

  const m = current.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) throw new Error(`Current version "${current}" is not plain SemVer`);
  const [, a, b, c] = m.map((s, i) => (i === 0 ? s : parseInt(s, 10)));

  switch (input) {
    case 'patch':
      return `${a}.${b}.${c + 1}`;
    case 'minor':
      return `${a}.${b + 1}.0`;
    case 'major':
      return `${a + 1}.0.0`;
    default:
      throw new Error(`Unknown bump level "${input}" — use patch|minor|major or x.y.z`);
  }
}

function writeJsonVersion(file, next) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${file}`);
  }
  const text = fs.readFileSync(file, 'utf8');
  // Replace only the top-level "version" field; tauri.conf.json may have nested
  // objects with their own "version" keys (e.g. plugin schemas), so anchor on
  // the leading two-space indent + comma to keep this surgical.
  const replaced = text.replace(
    /^(\s+"version":\s*")[^"]+(",?\s*)$/m,
    `$1${next}$2`
  );
  if (replaced === text) {
    throw new Error(`Could not find a top-level "version" field to replace in ${file}`);
  }
  fs.writeFileSync(file, replaced);
}

function writeCargoTomlVersion(file, next) {
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${file}`);
  }
  const text = fs.readFileSync(file, 'utf8');
  // Cargo.toml: [package] section's `version = "x.y.z"`. Anchor on the
  // [package] header so we don't accidentally rewrite a dependency version.
  const replaced = text.replace(
    /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+(")/,
    `$1${next}$2`
  );
  if (replaced === text) {
    throw new Error(`Could not find [package] version in ${file}`);
  }
  fs.writeFileSync(file, replaced);
}

import { execSync } from 'node:child_process';

function refreshNpmLock(root) {
  if (!fs.existsSync(path.join(root, 'package-lock.json'))) return;
  console.log(`  refreshing package-lock.json...`);
  execSync('npm install --package-lock-only --silent', {
    cwd: root,
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

function refreshCargoLock(root) {
  const cargoToml = path.join(root, 'src-tauri', 'Cargo.toml');
  if (!fs.existsSync(cargoToml)) return;
  console.log(`  refreshing Cargo.lock...`);
  // `cargo update --workspace --offline` would be ideal but requires the index
  // already populated. `cargo metadata` is enough to make cargo rewrite the
  // lockfile with the new package version, and is offline-safe.
  try {
    execSync('cargo metadata --format-version 1 --offline', {
      cwd: path.join(root, 'src-tauri'),
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  } catch {
    // Fall back to non-offline if the lockfile is missing crates we haven't
    // fetched yet. The build will need the network anyway.
    execSync('cargo metadata --format-version 1', {
      cwd: path.join(root, 'src-tauri'),
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  }
}
