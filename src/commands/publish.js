import { loadConfig, UPDATE_DOMAIN } from '../config.js';
import { publishElectron } from '../adapters/electron.js';
import { publishTauri } from '../adapters/tauri.js';
import { publishRust } from '../adapters/rust.js';
import { publishQt } from '../adapters/qt.js';

const ADAPTERS = {
  electron: publishElectron,
  tauri: publishTauri,
  rust: publishRust,
  qt: publishQt,
};

export async function publishCommand(args) {
  const dryRun = args.includes('--dry-run');
  const cfg = loadConfig();

  const ctx = { ...cfg, dryRun, cwd: process.cwd() };

  console.log(
    `Publishing ${cfg.app} via ${cfg.framework} adapter${dryRun ? ' [DRY RUN]' : ''}`
  );

  const adapter = ADAPTERS[cfg.framework];
  await adapter(ctx);

  console.log(
    `\n✅ Published — live at https://${UPDATE_DOMAIN}/${cfg.slug}/${cfg.app}/`
  );
}
