import { execSync } from 'node:child_process';
import { BUCKET } from './config.js';

// Wrapper around `npx wrangler r2 object put`. Kept as one shell call per file
// so we inherit stdio and the user sees wrangler's own progress + errors.
export function uploadFile({ localPath, slug, app, filename, contentType, dryRun }) {
  const key = `${slug}/${app}/${filename}`;
  // Quote the path to survive spaces (common on Windows); wrangler tolerates forward slashes.
  const cmd = [
    'npx', 'wrangler', 'r2', 'object', 'put',
    `${BUCKET}/${key}`,
    `--file=${JSON.stringify(localPath)}`,
    `--content-type=${JSON.stringify(contentType)}`,
    '--remote',
  ].join(' ');

  console.log(`\n$ ${cmd}`);
  if (dryRun) {
    console.log('(dry-run — skipped)');
    return;
  }
  execSync(cmd, { stdio: 'inherit' });
}

export function contentTypeFor(filename) {
  const f = filename.toLowerCase();
  if (f.endsWith('.yml') || f.endsWith('.yaml')) return 'text/yaml';
  if (f.endsWith('.json')) return 'application/json';
  if (f.endsWith('.xml')) return 'application/xml';
  if (f.endsWith('.exe')) return 'application/vnd.microsoft.portable-executable';
  if (f.endsWith('.msi')) return 'application/x-msdownload';
  if (f.endsWith('.blockmap')) return 'application/octet-stream';
  if (f.endsWith('.zip')) return 'application/zip';
  if (f.endsWith('.7z')) return 'application/x-7z-compressed';
  if (f.endsWith('.gz') || f.endsWith('.tar.gz')) return 'application/gzip';
  if (f.endsWith('.dmg')) return 'application/x-apple-diskimage';
  if (f.endsWith('.appimage')) return 'application/octet-stream';
  if (f.endsWith('.deb')) return 'application/vnd.debian.binary-package';
  if (f.endsWith('.rpm')) return 'application/x-rpm';
  if (f.endsWith('.sig') || f.endsWith('.sha1')) return 'text/plain';
  return 'application/octet-stream';
}
