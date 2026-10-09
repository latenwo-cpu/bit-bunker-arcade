/**
 * Copies the website (public/) into www/, which is the folder Capacitor
 * packages inside the Android app (see "webDir" in capacitor.config.json).
 *
 * Run this before every `npx cap sync android` so the app always contains
 * your latest website files:   npm run android:sync
 *
 * Left out of the app on purpose:
 *   admin.html   - your admin panel must never ship inside a public app
 *   sw.js        - the service worker is for the website; the app already
 *                  has every file bundled locally
 *   offline.html - only used by the service worker
 *   404.html, feature-graphic.png - website-only (error page, share image)
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'public');
const dest = path.join(root, 'www');
const EXCLUDE = new Set(['admin.html', 'sw.js', 'offline.html', '404.html', 'feature-graphic.png']);

if (!fs.existsSync(path.join(src, 'index.html'))) {
  console.error('public/index.html not found - run this from the project folder.');
  process.exit(1);
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

let count = 0;
for (const name of fs.readdirSync(src)) {
  if (EXCLUDE.has(name)) continue;
  fs.cpSync(path.join(src, name), path.join(dest, name), { recursive: true });
  count++;
}
console.log(`www/ updated from public/ (${count} items copied, admin.html excluded).`);
