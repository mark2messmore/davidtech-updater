import { slugCommand } from './commands/slug.js';
import { registerCommand } from './commands/register.js';
import { publishCommand } from './commands/publish.js';
import { bumpCommand } from './commands/bump.js';
import { setPathCommand } from './commands/set-path.js';
import { listApps } from './registry.js';

const USAGE = `
davidtech-updater — auto-update control plane for DavidTech apps

This is the AI-driven release control center. The normal flow is:
  1. Open this repo in Claude Code
  2. Tell Claude: "hey I updated <app>" (or similar)
  3. Claude reads CLAUDE.md, follows the runbook, ships to R2

The CLI commands below are what Claude (or you) calls under the hood.

Commands:
  apps                              List registered apps
  register <name> --framework=<fw> [--repo=<owner/name>] [--local=<path>]
                                    Add a new app to apps.json
  set-path <name> <absolute-path>   Set/update localPath on an existing app
  bump <name> <patch|minor|major|x.y.z>
                                    Bump version in lockstep across the app's
                                    package.json + Cargo.toml + tauri.conf.json
  publish <name> [--from=<path>] [--dry-run]
                                    Build artifacts already at <path> get
                                    signed-and-uploaded to R2 + manifest written
  slug                              Generate a 12-char slug

Frameworks: electron | tauri | rust | qt

Required on this machine:
  wrangler    Cached OAuth, or CLOUDFLARE_API_TOKEN with R2 write on davidtech-app-updates
  Node 18+
  (For Tauri apps:) cargo, MSVC build tools, npm — to actually build the binary

The full runbook lives in CLAUDE.md.
`.trim();

export async function main(argv) {
  const [cmd, ...rest] = argv;

  switch (cmd) {
    case 'slug':
      return slugCommand(rest);
    case 'register':
      return registerCommand(rest);
    case 'set-path':
      return setPathCommand(rest);
    case 'bump':
      return bumpCommand(rest);
    case 'publish':
      return publishCommand(rest);
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
    console.log('No apps registered. Use: register <name> --framework=<fw>');
    return;
  }
  const rows = entries.map(([name, app]) => ({
    name,
    framework: app.framework,
    slug: app.slug,
    repo: app.repo ?? '(none)',
    localPath: app.localPath ?? '(not set)',
  }));
  console.table(rows);
}
