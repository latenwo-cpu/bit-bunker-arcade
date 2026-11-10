# Pixel Arcade – AdSense / AdMob fix, round 2

## What I found in your project
1. **All 28 game pages (`public/games/*.html`) loaded the AdSense script.** These pages are essentially a game screen, and Google does not allow AdSense on screens without publisher content (games must use the separate H5 Games Ads program). Google can also auto-place ads on them. **Removed** the AdSense loader from every game page.
2. **Home page could still show ads while a game was being played** (the games run inside `index.html`). Now: AdSense is not loaded on `/?play=...` URLs, and while any game screen is open all AdSense / auto-ad elements are force-hidden (`pa-no-ads` class set in `showScreen()`).
3. **The Android app bundle was stale.** `www/` and `android/app/src/main/assets/public/` still had the OLD pixelarcade-44662.web.app canonical URLs, sitemap, etc. They are now re-synced from the fixed `public/` (same result as `npm run android:sync`). `admin.html`, `sw.js`, `offline.html`, `404.html` are excluded from the app as before.
4. Service worker cache bumped v6 -> v7 so returning visitors get the new files.
5. Docs (RELEASE-CHECKLIST, PLAY-STORE-GUIDE, SETUP-README) now point to gamexpixel.com instead of the web.app address (use https://gamexpixel.com/privacy.html and /delete-data.html in Play Console).

Already correct (not changed): ads.txt, app-ads.txt, canonical tags, sitemap, guides, About/Contact/Terms/Privacy, AdMob plugin + manifest App ID, consent flow.

## Why AdSense and AdMob both say "not approved"
Both of your screenshots show the same publisher account (pub-5271137719829070). AdSense and AdMob share one Google account status, so a policy problem found on the website shows up in AdMob too. Fix AdSense first.
Google's message is generic and does not name the exact policy. Open the email -> "Review your application" to see the specific reason. If it differs from the above, send it to me.

## Steps (in this order)
1. Copy this folder over your project, then `firebase deploy --only hosting`.
2. Check https://gamexpixel.com/ads.txt and https://gamexpixel.com/games/pong.html (view source: no `adsbygoogle` there).
3. AdSense -> Sites: only `gamexpixel.com`. AdSense -> Ads -> Auto ads: OFF for now (or exclude `gamexpixel.com/?play=*`).
4. Admin panel -> Ad Settings: keep game-end interstitials OFF until AdSense approves the site.
5. Wait 2–3 days for a re-crawl, then tick the checkbox and press **Resubmit once**.
6. App: run `npm install`, `npx cap sync android` (optional, assets are already synced), raise the version code, build the AAB.
7. AdMob: the app must be published on Google Play (same package app.web.pixel_arcade.twa) and listed in AdMob -> Apps; developer website in the Play listing must be gamexpixel.com so app-ads.txt is found. Resubmit AdMob after AdSense is approved.
8. Never click your own live ads (invalid traffic can get the account disabled); use test devices.

node_modules/, android/build and .gradle are not in the zip: run `npm install`.
