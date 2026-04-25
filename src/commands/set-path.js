import path from 'node:path';
import { updateApp } from '../registry.js';

const USAGE = `
Usage:
  set-path <app> <absolute-path>

Sets or updates the localPath for an app — the absolute path to the app's
source on this machine. Used by the AI-driven release flow to know where
to bump versions and run the build.

Example:
  set-path beam-profiler "C:\\\\Users\\\\mark2\\\\Documents\\\\MyRepos\\\\dukane-beam-profiler"
`.trim();

export function setPathCommand(args) {
  const [name, raw] = args;

  if (!name || !raw) {
    console.error(`Missing arguments.\n\n${USAGE}`);
    process.exit(2);
  }

  const localPath = path.resolve(raw);
  const updated = updateApp(name, { localPath });
  console.log(`✓ ${name}.localPath = ${updated.localPath}`);
}
