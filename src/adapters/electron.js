import fs from 'node:fs';
import path from 'node:path';
import { uploadFile, contentTypeFor } from '../upload.js';

// Electron artifacts (produced by electron-builder NSIS target):
//   latest.yml                      manifest — electron-builder writes it
//   <Product>Setup.exe              NSIS installer
//   <Product>Setup.exe.blockmap     delta-download block index
//
// Unlike Tauri, electron-builder generates the manifest itself, so we just
// ship whatever is in the artifacts dir that matches the expected extensions.
export async function publishElectron(ctx) {
  const { artifactsDir, slug, app, dryRun } = ctx;

  const all = fs.readdirSync(artifactsDir);
  const files = all.filter(
    (f) => f === 'latest.yml' || f.endsWith('.exe') || f.endsWith('.blockmap')
  );

  if (!files.includes('latest.yml')) {
    throw new Error(
      `latest.yml missing in ${artifactsDir}. ` +
        `Confirm electron-builder ran the NSIS target (not portable) and the "publish" block ` +
        `in package.json is configured.`
    );
  }
  if (!files.some((f) => f.endsWith('.exe'))) {
    throw new Error(
      `No .exe in ${artifactsDir} — electron-builder did not produce an installer`
    );
  }

  for (const f of files) {
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
