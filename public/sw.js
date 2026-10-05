/* Pixel Arcade service worker
 * ---------------------------------------------------------------
 * Goal: let the app shell + every single-player game load and run
 * with no connection at all. Nothing here ever touches the things
 * that require a live connection anyway (Firestore rooms/leaderboards,
 * Firebase Auth, AdSense) — those are explicitly left untouched so
 * they keep working exactly as before when online, and simply fail
 * the same way they always would if you're offline.
 *
 * Bump CACHE_VERSION whenever the precache list below changes so
 * clients pick up the new list instead of reusing a stale cache.
 */
const CACHE_VERSION = 'v2';
const STATIC_CACHE = `pixelarcade-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `pixelarcade-runtime-${CACHE_VERSION}`;

// The app shell: the actual game code lives inside arcade.html/index.html,
// so once these are cached the whole single-player experience works
// offline. The /games/*.html pages are the lightweight SEO landers that
// link into arcade.html — cheap to precache too, so a bookmarked or
// shared link to a specific game also opens offline.
const APP_SHELL = [
  '/',
  '/arcade.html',
  '/interstitial-ads.js',
  '/manifest.json',
  '/offline.html',
  '/pixelarcade-icon.svg',
  '/pixelarcade-logo-horizontal.svg',
  '/icons/icon-72.png',
  '/icons/icon-96.png',
  '/icons/icon-128.png',
  '/icons/icon-144.png',
  '/icons/icon-192.png',
  '/icons/icon-384.png',
  '/icons/icon-512.png',
  '/games/2048.html',
  '/games/battleship.html',
  '/games/breakout.html',
  '/games/checkers.html',
  '/games/connect4.html',
  '/games/dotsboxes.html',
  '/games/drift3d.html',
  '/games/hangman.html',
  '/games/memory.html',
  '/games/minesweeper.html',
  '/games/pong.html',
  '/games/reversi.html',
  '/games/runner3d.html',
  '/games/shooter3d.html',
  '/games/simon.html',
  '/games/sliding.html',
  '/games/snake.html',
  '/games/spaceinvaders.html',
  '/games/tictactoe.html',
  '/games/whackamole.html',
  '/games/wordsearch.html'
];

// The 3D games (Neon Runner / Turbo Drift / Neon Blaster) pull in three.js
// from a CDN. It's a static library file, so it's safe and worthwhile to
// cache it too — without it those three games can't start offline even
// though their own code is already cached. Cached as an opaque no-cors
// response since cdnjs doesn't need to be readable, just replayable.
const THIRD_PARTY_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
];

// Anything that talks to these hosts is powering live multiplayer rooms,
// sign-in, spectating, or ads — never intercept, never cache. Requests to
// them should always hit the real network and fail/succeed exactly as
// they would with no service worker installed at all.
const NEVER_INTERCEPT_HOSTS = [
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'firebaseinstallations.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
  'www.googleapis.com',
  'www.gstatic.com',
  'apis.google.com',
  'accounts.google.com',
  'pagead2.googlesyndication.com',
  'googleads.g.doubleclick.net',
  'googlesyndication.com',
  'google-analytics.com',
  'googletagmanager.com',
  'firebaseapp.com',
  'firebasestorage.googleapis.com',
  'firebasestorage.app',
  'storage.googleapis.com'
];

function isNeverIntercept(hostname){
  return NEVER_INTERCEPT_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(APP_SHELL);
    // Best-effort: don't fail the whole install if the CDN is unreachable
    // at build/first-visit time.
    await Promise.all(THIRD_PARTY_ASSETS.map(async (url) => {
      try {
        const res = await fetch(url, { mode: 'no-cors' });
        await cache.put(url, res);
      } catch (err) { /* skip — not fatal */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k !== STATIC_CACHE && k !== RUNTIME_CACHE).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

async function networkFirst(request){
  try{
    const fresh = await fetch(request);
    if(fresh && fresh.ok){
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, fresh.clone());
    }
    return fresh;
  }catch(err){
    const cached = await caches.match(request);
    if(cached) return cached;
    const shell = await caches.match('/arcade.html');
    if(shell) return shell;
    return caches.match('/offline.html');
  }
}

async function cacheFirst(request){
  const cached = await caches.match(request);
  if(cached) return cached;
  try{
    const fresh = await fetch(request);
    if(fresh && (fresh.ok || fresh.type === 'opaque')){
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, fresh.clone());
    }
    return fresh;
  }catch(err){
    return cached || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if(req.method !== 'GET') return; // never intercept writes/streams

  const url = new URL(req.url);

  if(url.origin !== self.location.origin){
    if(THIRD_PARTY_ASSETS.includes(req.url)){
      event.respondWith(cacheFirst(req));
      return;
    }
    if(isNeverIntercept(url.hostname)) return; // let the network handle it
    return; // any other unrecognized cross-origin request: don't touch it
  }

  // The game-end ad module is tiny and changes with admin features: always try the network first.
  if(url.pathname === '/interstitial-ads.js'){
    event.respondWith(networkFirst(req));
    return;
  }

  // HTML documents: network-first, so players online always get the
  // current build; offline, they get the last cached copy (or the
  // offline page as a last resort).
  const isNavigation = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');
  if(isNavigation){
    event.respondWith(networkFirst(req));
    return;
  }

  // Static, same-origin assets (icons, manifest, etc.): cache-first.
  event.respondWith(cacheFirst(req));
});
