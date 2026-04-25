import path from 'node:path';
import {
  assertApp,
  assertFramework,
  assertRepo,
  UPDATE_DOMAIN,
} from '../config.js';
import { generateSlug } from './slug.js';
import { addApp } from '../registry.js';

const USAGE = `
Usage:
  register <name> --framework=<electron|tauri|rust|qt> [--repo=<owner/name>] [--local=<absolute-path>]

  --repo  optional — the GitHub repo (used for documentation / future GH-fetch fallback).
  --local optional — absolute path to the app's source on this machine. Required for the
          AI-driven local-build release flow. Add it now or with 'set-path' later.
`.trim();

export function registerCommand(args) {
  const { positional, flags } = parseArgs(args);
  const [name] = positional;

  if (!name) {
    console.error(`Missing app name.\n\n${USAGE}`);
    process.exit(2);
  }
  assertApp(name);

  const framework = flags.framework;
  if (!framework) {
    console.error(`Missing --framework.\n\n${USAGE}`);
    process.exit(2);
  }
  assertFramework(framework);

  const repo = flags.repo;
  if (repo) assertRepo(repo);

  const localPath = flags.local ? path.resolve(flags.local) : undefined;

  // addApp() guards against duplicate names and enforces all field shapes.
  const slug = generateSlug();
  const entry = addApp(name, { slug, framework, repo, localPath });

  console.log(`\nRegistered "${name}":`);
  console.log(JSON.stringify(entry, null, 2));

  printNextSteps({ name, slug, framework });
}

function printNextSteps({ name, slug, framework }) {
  const endpoint = `https://${UPDATE_DOMAIN}/${slug}/${name}`;
  console.log(`\n--- Next steps for ${framework} ---\n`);

  if (framework === 'tauri') {
    console.log(
      `1. Paste this into src-tauri/tauri.conf.json:\n\n` +
        JSON.stringify(
          {
            plugins: {
              updater: {
                active: true,
                dialog: false,
                pubkey: '<SHARED_DAVIDTECH_PUBKEY>',
                endpoints: [`${endpoint}/latest.json`],
              },
            },
            bundle: {
              createUpdaterArtifacts: true,
              targets: ['nsis'],
            },
          },
          null,
          2
        )
    );
    console.log(
      `\n2. cargo add tauri-plugin-updater --features native-tls` +
        `\n3. npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process` +
        `\n4. Register the plugin in src-tauri/src/lib.rs:` +
        `\n   .plugin(tauri_plugin_updater::Builder::new().build())` +
        `\n5. Wire a "Check for updates" button using check() + downloadAndInstall() + relaunch()` +
        `\n6. Publish a GitHub Release (e.g. via tauri-action), then run:` +
        `\n   npm run publish -- ${name}`
    );
  } else if (framework === 'electron') {
    console.log(
      `1. In package.json, set the electron-builder publish block:\n\n` +
        JSON.stringify(
          {
            build: {
              publish: [{ provider: 'generic', url: endpoint, channel: 'latest' }],
              nsis: { oneClick: true, perMachine: true },
            },
          },
          null,
          2
        )
    );
    console.log(
      `\n2. npm install --save electron-updater` +
        `\n3. Wire autoUpdater.checkForUpdates() in main.js` +
        `\n4. Either (a) publish a GitHub Release with latest.yml + .exe + .blockmap,` +
        `\n   or (b) build locally and run: npm run publish -- ${name} --from=<path-to-repo>`
    );
  } else {
    console.log(
      `Adapter "${framework}" is stubbed — see README for porting guidance.`
    );
  }
}

function parseArgs(args) {
  const positional = [];
  const flags = {};
  for (const a of args) {
    if (a.startsWith('--')) {
      const [k, ...v] = a.slice(2).split('=');
      flags[k] = v.length > 0 ? v.join('=') : true;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags };
}
