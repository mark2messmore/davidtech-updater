import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Framework → which release-asset patterns to pull. These are the bundle files
// the corresponding adapter knows how to process.
const PATTERNS_BY_FRAMEWORK = {
  tauri: ['*.nsis.zip', '*.nsis.zip.sig'],
  electron: ['latest.yml', '*.exe', '*.blockmap'],
  rust: ['*.exe', '*.sig', '*.json'],
  qt: ['Updates.xml', '*.7z', '*.sha1'],
};

export function assertGhAvailable() {
  try {
    execSync('gh --version', { stdio: 'pipe' });
  } catch {
    throw new Error(
      `GitHub CLI 'gh' not found on PATH.\n` +
        `Install from https://cli.github.com/ and run 'gh auth login'.`
    );
  }
}

export function latestReleaseTag(repo) {
  assertGhAvailable();
  const out = execSync(
    `gh release view --repo ${repo} --json tagName --jq .tagName`,
    { encoding: 'utf8' }
  );
  return out.trim();
}

export function releaseBody(repo, tag) {
  try {
    const out = execSync(
      `gh release view ${tag} --repo ${repo} --json body --jq .body`,
      { encoding: 'utf8' }
    );
    return out.trim() || null;
  } catch {
    return null;
  }
}

// Download release assets for the given framework into a fresh temp dir.
// Returns the temp dir path so the caller can hand it to an adapter.
export function fetchReleaseAssets({ repo, tag, framework }) {
  assertGhAvailable();

  const patterns = PATTERNS_BY_FRAMEWORK[framework];
  if (!patterns) {
    throw new Error(`No asset patterns defined for framework "${framework}"`);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dtu-'));
  // gh release download accepts multiple --pattern flags; wrap each in quotes so
  // globs reach the binary without the shell expanding them first.
  const patternArgs = patterns.map((p) => `--pattern="${p}"`).join(' ');
  const cmd = `gh release download ${tag} --repo ${repo} --dir "${tmp}" ${patternArgs}`;

  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });

  const entries = fs.readdirSync(tmp);
  if (entries.length === 0) {
    throw new Error(
      `No assets downloaded from ${repo}@${tag}. Check that the release has the expected ` +
        `artifacts: ${patterns.join(', ')}`
    );
  }

  return tmp;
}

// Strip a leading 'v' from a tag — Tauri manifests expect plain SemVer.
export function tagToVersion(tag) {
  return tag.replace(/^v/, '');
}

// Ask GitHub for the highest v-prefixed semver tag pushed to `repo`. Used by
// the polling workflow to decide "does this app have a release newer than
// what's on R2?" without the app needing to create a GitHub Release.
export function latestSemverTag(repo) {
  assertGhAvailable();
  const out = execSync(
    `gh api repos/${repo}/tags --paginate --jq ".[].name"`,
    { encoding: 'utf8' }
  );
  const tags = out
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => /^v\d+\.\d+\.\d+/.test(s));
  if (tags.length === 0) return null;
  tags.sort(compareSemverTag);
  return tags[tags.length - 1];
}

// Compare "v1.2.3" style tags numerically. Returns -1/0/1 like a sort comparator.
// Doesn't handle pre-release suffixes (-beta.1) — DavidTech apps use plain SemVer.
export function compareSemverTag(a, b) {
  const parse = (t) => t.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
  const [a1, a2, a3] = parse(a);
  const [b1, b2, b3] = parse(b);
  if (a1 !== b1) return a1 - b1;
  if (a2 !== b2) return a2 - b2;
  return a3 - b3;
}

// Read the version currently published at R2 for (slug, app, framework).
// Returns null when nothing is published (Worker responds 204 for missing
// latest.json, 404 for missing latest.yml). Parses manifest inline — lightweight
// enough that pulling in a JSON-or-YAML lib isn't worth it for two formats.
export async function publishedVersion({ slug, app, framework }) {
  const { UPDATE_DOMAIN } = await import('./config.js');
  const filename = framework === 'tauri' ? 'latest.json' : 'latest.yml';
  const url = `https://${UPDATE_DOMAIN}/${slug}/${app}/${filename}`;

  const res = await fetch(url);
  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Unexpected ${res.status} fetching ${url}`);
  }
  const body = await res.text();

  if (framework === 'tauri') {
    return JSON.parse(body).version ?? null;
  }
  // Electron latest.yml — single-line "version: 1.2.3" at top of YAML
  const m = body.match(/^version:\s*['"]?([^'"\s]+)['"]?$/m);
  return m ? m[1] : null;
}
