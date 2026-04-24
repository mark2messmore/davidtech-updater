// Shared constants + validators. Used by the CLI and kept in sync with the
// regexes in worker/src/index.js.

export const BUCKET = 'davidtech-app-updates';
export const UPDATE_DOMAIN = 'updates.davidtechllc.com';
export const FRAMEWORKS = ['electron', 'tauri', 'rust', 'qt'];

// Worker path validation — these must match worker/src/index.js exactly,
// otherwise a value that passes CLI validation can still 404 at the edge.
export const SLUG_RE = /^[a-z0-9]{8,32}$/;
export const APP_RE = /^[a-z0-9-]{1,40}$/;

// Sensible GitHub "owner/repo" shape — GitHub's real rules are looser but
// typos cause silent failures later, so keep this strict.
export const REPO_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/;

export function assertSlug(slug) {
  if (!slug || !SLUG_RE.test(slug)) {
    throw new Error(`Invalid slug — must match ${SLUG_RE} (got: ${JSON.stringify(slug)})`);
  }
}

export function assertApp(name) {
  if (!name || !APP_RE.test(name)) {
    throw new Error(`Invalid app name — must match ${APP_RE} (got: ${JSON.stringify(name)})`);
  }
}

export function assertFramework(fw) {
  if (!FRAMEWORKS.includes(fw)) {
    throw new Error(`Invalid framework — must be one of ${FRAMEWORKS.join('|')} (got: ${JSON.stringify(fw)})`);
  }
}

export function assertRepo(repo) {
  if (!repo || !REPO_RE.test(repo)) {
    throw new Error(`Invalid repo — must be "owner/name" (got: ${JSON.stringify(repo)})`);
  }
}
