// Qt / QtIFW adapter — not yet implemented.
//
// QtIFW uses a totally different model: a "maintenance tool" binary installed
// alongside the app, which polls an Updates.xml index + downloads .7z component
// archives. The Worker regex already accepts .xml / .7z / .sha1.
//
// The pattern to port lives in the original AUTO_UPDATE_SETUP.md §24
// (dukane-cam-viewer repo).
export async function publishQt() {
  throw new Error(
    'Qt adapter not yet implemented.\n' +
      'See §24 of AUTO_UPDATE_SETUP.md in the dukane-cam-viewer repo for the pattern, ' +
      'and contribute by filling in src/adapters/qt.js.'
  );
}
