// davidtech update server
// Serves auto-update artifacts (manifests + installers) from R2.
// Paths: /<slug>/<app>/<file> — the slug gates access; without it you get 404.
//
// This Worker is intentionally a thin proxy so that future capabilities
// (minVersion forcing, staged rollouts, telemetry, rollback, hosting swap)
// can be added here without touching any deployed kiosk.

// Covers every framework the davidtech-updater CLI supports:
//   Electron:    .yml, .exe, .blockmap
//   Tauri:       .json, .zip, .gz (tar.gz), .sig, .msi, .AppImage, .dmg
//   Native Rust: .exe, .bin, .sig, plus .deb/.rpm if Linux ever happens
//   Qt (QtIFW):  .xml, .7z, .sha1
const ALLOWED_FILE = /^[a-zA-Z0-9._-]+\.(yml|json|xml|exe|msi|blockmap|zip|7z|gz|AppImage|dmg|deb|rpm|sig|sha1|bin)$/;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);

    // Root: don't leak info
    if (parts.length === 0) {
      return new Response("", { status: 404 });
    }

    // Path shape: /<slug>/<app>/<file>
    if (parts.length !== 3) {
      return new Response("", { status: 404 });
    }

    const [slug, appName, file] = parts;

    // Basic hygiene — these regexes match the CLI's validation in src/config.js
    if (!/^[a-z0-9]{8,32}$/.test(slug)) return new Response("", { status: 404 });
    if (!/^[a-z0-9-]{1,40}$/.test(appName)) return new Response("", { status: 404 });
    if (!ALLOWED_FILE.test(file)) return new Response("", { status: 404 });

    // Only GET/HEAD
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("", { status: 405 });
    }

    const key = `${slug}/${appName}/${file}`;

    // Range support for resumable downloads
    const rangeHeader = request.headers.get("range");
    const range = rangeHeader ? parseRange(rangeHeader) : undefined;

    const obj = await env.BUCKET.get(key, {
      range,
      onlyIf: request.headers,
    });

    if (!obj) {
      // Tauri v2's updater plugin treats HTTP 204 as "client is up to date".
      // Returning 204 for a missing latest.json means a registered-but-never-
      // published app doesn't error in the client — it reports no update
      // available, which is the honest answer. Other missing files stay 404;
      // Electron's latest.yml and Qt's Updates.xml must exist before their
      // respective clients look, and those updaters don't have the 204
      // convention.
      if (file === "latest.json") return new Response("", { status: 204 });
      return new Response("", { status: 404 });
    }

    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set("etag", obj.httpEtag);

    // Short cache so a new release propagates fast; manifests + signatures must not be stale
    if (file.endsWith(".yml") || file.endsWith(".json") || file.endsWith(".xml") || file.endsWith(".sig") || file.endsWith(".sha1")) {
      headers.set("cache-control", "public, max-age=30");
    } else {
      headers.set("cache-control", "public, max-age=3600");
    }

    // Observability — visible in Cloudflare Workers logs
    const ua = request.headers.get("user-agent") || "";
    const ver = request.headers.get("x-app-version") || "";
    const kioskId = request.headers.get("x-kiosk-id") || "";
    console.log(JSON.stringify({
      app: appName, file, version: ver, kioskId,
      ua: ua.slice(0, 120), cf: request.cf?.country,
    }));

    if (obj.body) {
      return new Response(obj.body, {
        status: range ? 206 : 200,
        headers,
      });
    }
    return new Response(null, { status: 304, headers });
  },
};

function parseRange(header) {
  const m = /^bytes=(\d+)-(\d*)$/.exec(header);
  if (!m) return undefined;
  const offset = Number(m[1]);
  const end = m[2] ? Number(m[2]) : undefined;
  return end !== undefined ? { offset, length: end - offset + 1 } : { offset };
}
