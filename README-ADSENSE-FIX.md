# Pixel Arcade – AdSense fix (website)

Replace your project's `public/` folder with the `public/` folder in this zip, then run `firebase deploy`.
(If you also build the Android app, run `npm run sync:web` afterwards so `www/` gets the same files.)

## What was wrong and what changed

1. **Wrong domain in the SEO tags.** Your site runs on gamexpixel.com, but canonical tags, sitemap, robots.txt and JSON-LD on every page all pointed to pixelarcade-44662.web.app. Google therefore saw gamexpixel.com as a copy of another site. All of these now use https://gamexpixel.com, and visits to the web.app / firebaseapp.com address redirect to gamexpixel.com.
2. **Duplicate, noindex app page.** The game pages sent players to `/arcade.html?play=...`, a noindex copy of the home page. Play buttons now go to `/?play=...`, and `arcade.html` is a tiny redirect.
3. **Ads on game-play screens.** The app page had ad slots above and below every game. AdSense on the website is now limited to the content area of the home page and is never shown on game-play screens (Google does not allow ads on screens without publisher content).
4. **Thin content.** Added 8 original guides (/guides/), a guides index, a fuller Contact page, a visible H1 on the home page (it was hidden), a custom 404 page, and links to Guides / About / Contact / Terms / Privacy in the footer. Each game page links to its guide.
5. **Sitemap** rebuilt with the new domain and the new guide pages.

## Do these steps in order after deploying

1. Open https://gamexpixel.com/ads.txt – it must show `google.com, pub-5271137719829070, DIRECT, f08c47fec0942fa0`.
2. Open https://gamexpixel.com/guides/ and one guide to confirm the new pages are live.
3. In Firebase Console > Hosting, make sure gamexpixel.com is the main domain (set the web.app domain to redirect to it if offered).
4. In AdSense > Sites, the site listed must be exactly `gamexpixel.com` (remove any pixelarcade-44662.web.app entry).
5. In AdSense > Ads > Auto ads, turn off auto ads for now or exclude `gamexpixel.com/?play=*`. Do not place ad units on game-play screens.
6. In Google Search Console, add gamexpixel.com, submit https://gamexpixel.com/sitemap.xml and request indexing of the home page and /guides/.
7. Wait 2–3 days so Google re-crawls, then tick the policy checkbox and press **Resubmit** once. Repeated resubmits without changes make it worse.

## Honest note
Google's message ("meet program policies") is generic and does not name the exact reason, so nobody can be 100% sure from outside. These changes cover the issues found in your code. If it is rejected again, open the email's "Review your application" page and send me the exact reason shown there.

## AdMob (do after the website is approved)
AdMob needs the Android app to be live on Google Play and `app-ads.txt` on the same domain as the developer website in the Play listing (gamexpixel.com/app-ads.txt). That file is already correct.
