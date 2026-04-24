import { slugCommand } from './commands/slug.js';
import { registerCommand } from './commands/register.js';
import { publishCommand } from './commands/publish.js';
import { checkReleasesCommand } from './commands/check-releases.js';
import { listApps } from './registry.js';

const USAGE = `
davidtech-updater — auto-update control plane for DavidTech apps

Usage:
  npm run <command> -- <args>       (from inside this repo)
  node bin/davidtech-updater.js <command> <args>

Commands:
  register <name> --framework=<fw> [--repo=<owner/name>]
                                    Register a new app in apps.json
  publish <name> [tag] [--from=<path>] [--dry-run]
                                    Publish an app's release to R2
  check-releases [--json]           Compare registered apps' latest tags against R2;
                                    list apps that need publishing (used by CI cron)
  apps                              List registered apps
  slug                              Generate a 12-char slug (not usually needed —
                                    'register' does this automatically)

Frameworks: electron | tauri | rust | qt

Publish source:
  default — download assets from GitHub Releases via 'gh' (uses the registry's repo)
  --from  — read artifacts from a local project root (useful for Option A: local builds)

Required on the machine running 'publish':
  wrangler    Cached OAuth or CLOUDFLARE_API_TOKEN with R2 write on davidtech-app-updates
  gh          Authenticated with access to the app's repo (only when fetching from GitHub)

See README.md for the full workflow.
`.trim();

export async function main(argv) {
  const [cmd, ...rest] = argv;

  switch (cmd) {
    case 'slug':
      return slugCommand(rest);
    case 'register':
      return registerCommand(rest);
    case 'publish':
      return publishCommand(rest);
    case 'check-releases':
      return checkReleasesCommand(rest);
    case 'apps':
      return listCommand();
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

function listCommand() {
  const entries = listApps();
  if (entries.length === 0) {
    console.log('No apps registered. Use: npm run register -- <name> --framework=<fw>');
    return;
  }
  const rows = entries.map(([name, app]) => ({
    name,
    framework: app.framework,
    slug: app.slug,
    repo: app.repo ?? '(none)',
  }));
  console.table(rows);
}
