import fs from 'node:fs';
import path from 'node:path';
import { uploadFile, contentTypeFor } from '../upload.js';

// Electron / electron-builder convention:
//   Build output lives in ./dist/ (configurable via electron-builder.yml but
//   defaults are what every DavidTech app uses).
//   The 3 files the kiosk needs:
//     - latest.yml                  (manifest — electron-builder generates it)
//     - <Product>Setup.exe          (NSIS installer)
//     - <Product>Setup.exe.blockmap (delta-download block index)
//
// We don't try to guess the installer filename — we upload everything in dist/
// matching the allowed extensions, which covers renamed installers too.
export async function publishElectron(ctx) {
  const dist = path.join(ctx.cwd, 'dist');
  if (!fs.existsSync(dist)) {
    throw new Error(
      `./dist not found — run your electron-builder build first (e.g. 'npm run build:install')`
    );
  }

  const all = fs.readdirSync(dist);
  const files = all.filter(
    (f) => f === 'latest.yml' || f.endsWith('.exe') || f.endsWith('.blockmap')
  );

  if (!files.includes('latest.yml')) {
    throw new Error(
      `dist/latest.yml missing — electron-builder is supposed to emit this. ` +
        `Check that "publish" is configured in package.json and that you ran the NSIS target (not portable).`
    );
  }
  if (!files.some((f) => f.endsWith('.exe'))) {
    throw new Error(`No .exe found in dist/ — NSIS build did not produce an installer`);
  }

  for (const f of files) {
    uploadFile({
      localPath: path.join(dist, f),
      slug: ctx.slug,
      app: ctx.app,
      filename: f,
      contentType: contentTypeFor(f),
      dryRun: ctx.dryRun,
    });
  }
}
