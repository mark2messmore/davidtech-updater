import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertSlug,
  assertApp,
  assertFramework,
  assertRepo,
} from './config.js';

// apps.json lives at the repo root — not in the user's cwd. We resolve it from
// this module's path so `npm run publish <app>` works from any subdir.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.resolve(__dirname, '..', 'apps.json');
const CURRENT_SCHEMA = 1;

export function registryPath() {
  return REGISTRY_PATH;
}

export function loadRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) {
    return { schemaVersion: CURRENT_SCHEMA, apps: {} };
  }
  const parsed = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
  if (!parsed.apps || typeof parsed.apps !== 'object') {
    throw new Error(`apps.json malformed — missing "apps" object`);
  }
  // Forward-compat hook: surface unknown schema versions before we walk entries
  // that may have a shape we don't know how to read.
  if (parsed.schemaVersion && parsed.schemaVersion > CURRENT_SCHEMA) {
    throw new Error(
      `apps.json schemaVersion ${parsed.schemaVersion} is newer than this CLI understands ` +
        `(max: ${CURRENT_SCHEMA}). Update davidtech-updater.`
    );
  }
  return parsed;
}

export function saveRegistry(reg) {
  const normalized = {
    schemaVersion: CURRENT_SCHEMA,
    apps: reg.apps ?? {},
  };
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(normalized, null, 2) + '\n');
}

export function getApp(name) {
  const reg = loadRegistry();
  const app = reg.apps[name];
  if (!app) {
    const known = Object.keys(reg.apps);
    const hint = known.length
      ? `Known apps: ${known.join(', ')}`
      : `No apps registered yet. Use 'npm run register <name>' first.`;
    throw new Error(`App "${name}" not in registry.\n${hint}`);
  }
  return app;
}

export function addApp(name, entry) {
  assertApp(name);
  assertSlug(entry.slug);
  assertFramework(entry.framework);
  if (entry.repo) assertRepo(entry.repo);

  const reg = loadRegistry();
  if (reg.apps[name]) {
    throw new Error(
      `App "${name}" already registered — edit apps.json manually if you need to change it`
    );
  }
  reg.apps[name] = {
    slug: entry.slug,
    framework: entry.framework,
    ...(entry.repo ? { repo: entry.repo } : {}),
    registeredAt: new Date().toISOString(),
  };
  saveRegistry(reg);
  return reg.apps[name];
}

export function listApps() {
  return Object.entries(loadRegistry().apps);
}
