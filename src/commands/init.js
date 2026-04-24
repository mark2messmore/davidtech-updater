import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE } from '../config.js';
import { generateSlug } from './slug.js';

export function initCommand() {
  const cwd = process.cwd();
  const target = path.join(cwd, CONFIG_FILE);

  if (fs.existsSync(target)) {
    throw new Error(`${CONFIG_FILE} already exists in ${cwd}`);
  }

  const appName = path
    .basename(cwd)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'my-app';

  const config = {
    slug: generateSlug(),
    app: appName,
    framework: 'electron',
  };

  fs.writeFileSync(target, JSON.stringify(config, null, 2) + '\n');

  console.log(`Wrote ${target}:`);
  console.log(JSON.stringify(config, null, 2));
  console.log(`
Next steps:
  1. Edit 'framework' to match your app: electron | tauri | rust | qt
  2. Wire the per-framework client (see README).
  3. Set CLOUDFLARE_API_TOKEN as a GitHub secret for the release workflow.
  4. 'npx davidtech-updater publish' from CI after your build step.
`);
}
