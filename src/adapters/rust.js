// Native Rust adapter — not yet implemented.
//
// The pattern to port lives in the original AUTO_UPDATE_SETUP.md §23
// (dukane-cam-viewer repo). Short version: use the `self_update` crate on the
// client; on publish, upload a raw .exe plus a small JSON manifest (version +
// URL + optional SHA256) to R2 under <slug>/<app>/. The Worker regex already
// accepts .exe/.bin/.sig.
export async function publishRust() {
  throw new Error(
    'Rust adapter not yet implemented.\n' +
      'See §23 of AUTO_UPDATE_SETUP.md in the dukane-cam-viewer repo for the pattern, ' +
      'and contribute by filling in src/adapters/rust.js.'
  );
}
