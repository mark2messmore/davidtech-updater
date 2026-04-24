import crypto from 'node:crypto';

// 12-char [a-z0-9] slug — matches the Worker regex /^[a-z0-9]{8,32}$/.
// Not security-critical (anyone with the installed app can read the URL from its
// binary), but gates casual URL scraping and directory enumeration.
export function generateSlug() {
  let s = '';
  while (s.length < 12) {
    s += crypto.randomBytes(16).toString('base64').replace(/[^a-z0-9]/gi, '').toLowerCase();
  }
  return s.slice(0, 12);
}

export function slugCommand() {
  console.log(generateSlug());
}
