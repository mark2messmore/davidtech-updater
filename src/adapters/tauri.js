import fs from 'node:fs';
import path from 'node:path';
import { uploadFile, contentTypeFor } from '../upload.js';
import { UPDATE_DOMAIN } from '../config.js';

// Tauri v2 artifacts:
//   <product>_<version>_x64-setup.nsis.zip       updater archive (zipped NSIS)
//   <product>_<version>_x64-setup.nsis.zip.sig   Ed25519 signature
//
// We generate latest.json here, inlining the signature, since Tauri's updater
// reads the sig from the manifest (not a sidecar). Uploading the .sig alongside
// is harmless and useful for manual verification.
export async function publishTauri(ctx) {
  const { artifactsDir, slug, app, version, notes, dryRun } = ctx;

  const entries = fs.readdirSync(artifactsDir);
  const zipFile = entries.find((f) => f.endsWith('.nsis.zip'));
  const sigFile = entries.find((f) => f.endsWith('.nsis.zip.sig'));

  if (!zipFile) {
    throw new Error(
      `No .nsis.zip in ${artifactsDir}. ` +
        `For local builds: confirm tauri.conf.json has "bundle.createUpdaterArtifacts": true. ` +
        `For GitHub releases: confirm tauri-action attached the NSIS updater artifacts.`
    );
  }
  if (!sigFile) {
    throw new Error(
      `No .nsis.zip.sig in ${artifactsDir}. Signing key not configured during tauri build — ` +
        `set TAURI_SIGNING_PRIVATE_KEY before the build step.`
    );
  }

  const signature = fs.readFileSync(path.join(artifactsDir, sigFile), 'utf8').trim();

  const manifest = {
    version,
    notes: notes ?? `Version ${version}`,
    pub_date: new Date().toISOString(),
    platforms: {
      'windows-x86_64': {
        signature,
        url: `https://${UPDATE_DOMAIN}/${slug}/${app}/${zipFile}`,
      },
    },
  };

  const manifestPath = path.join(artifactsDir, 'latest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Wrote ${manifestPath}`);

  for (const f of [zipFile, sigFile, 'latest.json']) {
    uploadFile({
      localPath: path.join(artifactsDir, f),
      slug,
      app,
      filename: f,
      contentType: contentTypeFor(f),
      dryRun,
    });
  }
}
