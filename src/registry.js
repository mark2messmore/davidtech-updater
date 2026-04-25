import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertSlug,
  assertApp,
  assertFramework,
  assertRepo,
  assertLocalPath,
} from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.resolve(__dirname, '..', 'apps.json');
const CURRENT_SCHEMA = 2;

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
      : `No apps registered yet. Use 'register' first.`;
    throw new Error(`App "${name}" not in registry.\n${hint}`);
  }
  return app;
}

// Fuzzy match an app name from human input — "beam profiler" → "beam-profiler",
// "BEAM" → "beam-profiler", "the laser thing" → null. Returns the canonical
// registry key, or null if there's no clear single match.
//
// This is the entry point for the "hey I updated beam profiler" flow: the AI
// reads the user's wording, calls findApp(), gets the registry key, then runs
// the rest of the runbook with the canonical name.
export function findApp(query) {
  if (!query) return null;
  const reg = loadRegistry();
  const names = Object.keys(reg.apps);
  if (names.length === 0) return null;

  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const q = normalize(query);

  const exact = names.find((n) => normalize(n) === q);
  if (exact) return exact;

  const partial = names.filter((n) => normalize(n).includes(q) || q.includes(normalize(n)));
  return partial.length === 1 ? partial[0] : null;
}

export function addApp(name, entry) {
  assertApp(name);
  assertSlug(entry.slug);
  assertFramework(entry.framework);
  if (entry.repo) assertRepo(entry.repo);
  if (entry.localPath) assertLocalPath(entry.localPath);

  const reg = loadRegistry();
  if (reg.apps[name]) {
    throw new Error(
      `App "${name}" already registered — use updateApp() or edit apps.json manually`
    );
  }
  reg.apps[name] = {
    slug: entry.slug,
    framework: entry.framework,
    ...(entry.repo ? { repo: entry.repo } : {}),
    ...(entry.localPath ? { localPath: entry.localPath } : {}),
    registeredAt: new Date().toISOString(),
  };
  saveRegistry(reg);
  return reg.apps[name];
}

// Patch fields on an existing app entry. Used to set/change localPath after
// registration without hand-editing apps.json.
export function updateApp(name, patch) {
  const reg = loadRegistry();
  if (!reg.apps[name]) {
    throw new Error(`App "${name}" not in registry — register it first`);
  }
  if (patch.localPath !== undefined) assertLocalPath(patch.localPath);
  if (patch.repo !== undefined) assertRepo(patch.repo);

  reg.apps[name] = { ...reg.apps[name], ...patch };
  saveRegistry(reg);
  return reg.apps[name];
}

export function listApps() {
  return Object.entries(loadRegistry().apps);
}
