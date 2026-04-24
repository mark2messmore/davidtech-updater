import fs from 'node:fs';
import path from 'node:path';

export const BUCKET = 'davidtech-app-updates';
export const UPDATE_DOMAIN = 'updates.davidtechllc.com';
export const CONFIG_FILE = 'davidtech.config.json';
export const FRAMEWORKS = ['electron', 'tauri', 'rust', 'qt'];

// Worker accepts these slugs — keep this regex in sync with worker/src/index.js.
const SLUG_RE = /^[a-z0-9]{8,32}$/;
const APP_RE = /^[a-z0-9-]{1,40}$/;

export function loadConfig(cwd = process.cwd()) {
  const p = path.join(cwd, CONFIG_FILE);
  if (!fs.existsSync(p)) {
    throw new Error(
      `No ${CONFIG_FILE} in ${cwd}.\nRun:  npx davidtech-updater init`
    );
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`Failed to parse ${CONFIG_FILE}: ${e.message}`);
  }
  validate(cfg);
  return cfg;
}

function validate(cfg) {
  if (!cfg.slug || !SLUG_RE.test(cfg.slug)) {
    throw new Error(
      `Invalid "slug" — must match /^[a-z0-9]{8,32}$/ (got: ${JSON.stringify(cfg.slug)})`
    );
  }
  if (!cfg.app || !APP_RE.test(cfg.app)) {
    throw new Error(
      `Invalid "app" — must match /^[a-z0-9-]{1,40}$/ (got: ${JSON.stringify(cfg.app)})`
    );
  }
  if (!FRAMEWORKS.includes(cfg.framework)) {
    throw new Error(
      `Invalid "framework" — must be one of ${FRAMEWORKS.join('|')} (got: ${JSON.stringify(cfg.framework)})`
    );
  }
}
