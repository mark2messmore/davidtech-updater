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
