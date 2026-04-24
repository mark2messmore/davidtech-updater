import fs from 'node:fs';
import path from 'node:path';
import { uploadFile, contentTypeFor } from '../upload.js';
import { UPDATE_DOMAIN } from '../config.js';

// Tauri v2 convention:
//   Artifacts land under src-tauri/target/release/bundle/nsis/:
//     <product>_<version>_x64-setup.nsis.zip        updater artifact (zipped installer)
//     <product>_<version>_x64-setup.nsis.zip.sig    Ed25519 signature over the zip
//
// Unlike Electron, Tauri does NOT emit a manifest — we build latest.json here
// and embed the signature inline. The Tauri updater plugin reads the signature
// from the manifest, not from a sidecar file, so the .sig upload is belt-and-
// suspenders (harmless, useful for manual verification).
export async function publishTauri(ctx) {
  const bundleDir = path.join(ctx.cwd, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
  if (!fs.existsSync(bundleDir)) {
    throw new Error(
      `${bundleDir} not found — run 'npm run tauri build' first.\n` +
        `Also confirm tauri.conf.json has bundle.createUpdaterArtifacts=true and bundle.targets=["nsis"].`
    );
  }

  const entries = fs.readdirSync(bundleDir);
  const zipFile = entries.find((f) => f.endsWith('.nsis.zip'));
  const sigFile = entries.find((f) => f.endsWith('.nsis.zip.sig'));

  if (!zipFile) {
    throw new Error(
      `No .nsis.zip in ${bundleDir}. Make sure tauri.conf.json has ` +
        `"bundle.createUpdaterArtifacts": true.`
    );
  }
  if (!sigFile) {
    throw new Error(
      `No .nsis.zip.sig in ${bundleDir}. Tauri signing not configured — ` +
        `set TAURI_SIGNING_PRIVATE_KEY (and TAURI_SIGNING_PRIVATE_KEY_PASSWORD if encrypted) before tauri build.`
    );
  }

  const version = readVersion(ctx.cwd);
  const signature = fs.readFileSync(path.join(bundleDir, sigFile), 'utf8').trim();
  const notes = readNotes(ctx.cwd) ?? `Version ${version}`;

  const manifest = {
    version,
    notes,
    pub_date: new Date().toISOString(),
    platforms: {
      'windows-x86_64': {
        signature,
        url: `https://${UPDATE_DOMAIN}/${ctx.slug}/${ctx.app}/${zipFile}`,
      },
    },
  };

  const manifestPath = path.join(bundleDir, 'latest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Wrote ${manifestPath}`);

  for (const f of [zipFile, sigFile, 'latest.json']) {
    uploadFile({
      localPath: path.join(bundleDir, f),
      slug: ctx.slug,
      app: ctx.app,
      filename: f,
      contentType: contentTypeFor(f),
      dryRun: ctx.dryRun,
    });
  }
}

function readVersion(cwd) {
  // tauri.conf.json is authoritative for Tauri — it's what ends up in the bundle
  // filename. Fall back to package.json since many apps keep them in lockstep.
  const conf = path.join(cwd, 'src-tauri', 'tauri.conf.json');
  if (fs.existsSync(conf)) {
    const parsed = JSON.parse(fs.readFileSync(conf, 'utf8'));
    if (parsed.version) return parsed.version;
  }
  const pkg = path.join(cwd, 'package.json');
  if (fs.existsSync(pkg)) {
    const parsed = JSON.parse(fs.readFileSync(pkg, 'utf8'));
    if (parsed.version) return parsed.version;
  }
  throw new Error(
    'Could not determine version — expected a "version" field in src-tauri/tauri.conf.json or package.json'
  );
}

function readNotes(cwd) {
  for (const name of ['RELEASE_NOTES.md', 'RELEASE_NOTES.txt', 'NOTES.md']) {
    const p = path.join(cwd, name);
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8').trim();
  }
  return null;
}
