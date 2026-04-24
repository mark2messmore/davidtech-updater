import { slugCommand } from './commands/slug.js';
import { initCommand } from './commands/init.js';
import { publishCommand } from './commands/publish.js';

const USAGE = `
davidtech-updater — auto-update publish tool for DavidTech apps

Usage:
  davidtech-updater <command> [options]

Commands:
  slug                    Generate a new 12-char slug for a new app
  init                    Scaffold davidtech.config.json in the current directory
  publish [--dry-run]     Build manifest and upload artifacts to R2

Config file (./davidtech.config.json):
  {
    "slug": "q3k2m8p9x7h1",
    "app": "widget-tracker",
    "framework": "electron" | "tauri" | "rust" | "qt"
  }

Required env for 'publish':
  CLOUDFLARE_API_TOKEN    Scoped to R2 write on the davidtech-app-updates bucket

See https://github.com/mark2messmore/davidtech-updater for full docs.
`.trim();

export async function main(argv) {
  const [cmd, ...rest] = argv;

  switch (cmd) {
    case 'slug':
      return slugCommand(rest);
    case 'init':
      return initCommand(rest);
    case 'publish':
      return publishCommand(rest);
    case '--help':
    case '-h':
    case 'help':
    case undefined:
      console.log(USAGE);
      return;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.log(USAGE);
      process.exit(2);
  }
}
