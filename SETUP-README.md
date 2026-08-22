# Arcade — Computer Opponent + Admin Panel Setup

## 1. What changed in `arcade.html`

- **Connect Four & Checkers** now have a mode bar above the board: **2 Players** or **Vs Computer**, with **Easy / Medium / Hard** difficulty.
  - Connect Four AI: minimax with alpha-beta pruning (depth scales with difficulty).
  - Checkers AI: capture-aware move search, minimax on Medium/Hard, random-ish on Easy.
  - Everything else about the games is unchanged.
- An **analytics + ads engine** was added. It works in two modes:
  - **No Firebase configured (default):** the site works exactly as before. `logEvent()` calls silently no-op, and ad slots show the same placeholder text they do today.
  - **Firebase configured:** every session logs device/OS/browser, an approximate IP-based location, which screens/games were visited (the "flow"), game start/end results and difficulty, and ad impressions/clicks — all into Firestore, viewable in `admin.html`.

## 2. Why a backend is required for the admin panel

`arcade.html` is a static file that runs in each visitor's own browser. It has no way to see *other* visitors' data — there's nowhere to store it. To get a real admin panel (other users' IP/location/device, click data, etc.) you need somewhere central to write that data to. **Firebase (Firestore)** is the simplest option that needs no server of your own — free tier is generous for a small-to-medium arcade site.

## 3. One-time Firebase setup (~10 minutes)

1. Go to https://console.firebase.google.com → **Add project** → name it anything (e.g. "arcade-app") → finish the wizard.
2. In the project, click **Build → Firestore Database → Create database** → start in **production mode** → pick a region close to your users.
3. Click **Build → Authentication → Get started → Sign-in method → Email/Password → Enable**.
4. Still in Authentication, go to the **Users** tab → **Add user** → create yourself an admin login (email + password). This is the login for `admin.html`.
5. Go to **Project settings** (gear icon) → scroll to **Your apps** → click the **</> (Web)** icon → register an app (any nickname) → copy the `firebaseConfig` object it gives you.
6. Paste that config into **both** files:
   - `arcade.html` → find `const FIREBASE_CONFIG = {` near the top of the `<script>` block → fill in the values.
   - `admin.html` → same variable name, near the top of its `<script>` block.
7. In Firestore → **Rules** tab, replace the default rules with:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /events/{eventId} {
         allow create: if true;      // anyone can log an analytics event
         allow read, update, delete: if request.auth != null;  // only signed-in admin can read
       }
       match /config/{docId} {
         allow read: if true;        // arcade.html needs to read ad config publicly
         allow write: if request.auth != null;  // only signed-in admin can change ad settings
       }
     }
   }
   ```

   Click **Publish**.

That's it — reload `arcade.html`, browse around, then open `admin.html`, sign in with the admin login from step 4, and you'll see live data.

## 4. Ads

The **Ad Settings** tab in `admin.html` lets you switch between three modes at any time, with no code changes needed:

- **Manual ads** — upload an image URL + click-through link (or raw HTML) per ad slot. Good for house ads, sponsors, or affiliate banners. Works everywhere immediately.
- **Google AdSense** — for a website. Enter your publisher ID (`ca-pub-…`) and per-slot ad unit IDs from your AdSense account, and `arcade.html` will load real AdSense ads.
- **Google AdMob** — **only works inside a native mobile app**, not a plain browser tab. AdMob is Google's SDK for Android/iOS apps; it can't inject ads into a website. To use it, you'd wrap this HTML in a native shell (e.g. [Capacitor](https://capacitorjs.com/) or Cordova) and add the native AdMob plugin, which shows banners over the WebView. `arcade.html` is already wired for this: it looks for `window.AdMobBridge.showBanner(unitId, slot)` — if your native wrapper defines that function, ads will show; otherwise you'll see a text placeholder in the browser. If you go this route and want help wiring the Capacitor + AdMob plugin side, just ask.

## 5. What the admin panel shows

- **Overview** — sessions, unique users, games played, ad clicks/impressions, device/OS/browser/location breakdowns.
- **Users & Sessions** — one row per session: first-seen time, anonymous user ID, device/OS/browser, approximate location + IP, which games they played, and their click-through "flow" (screens visited in order).
- **Games & Levels** — start/finish counts per game, how many were vs-computer, difficulty breakdown, and a feed of recent results (win/loss/draw, score).
- **Ad Clicks** — impressions/clicks/CTR per ad slot ID.
- **Ad Settings** — the mode switcher described above.
- **Raw Events** — the last 500 raw log entries, for debugging.

## 6. Limits worth knowing

- Location is approximate (IP-based via a free public lookup), not GPS-precise.
- The admin login is a normal Firebase email/password account — treat that password like any other admin credential.
- Firestore's free tier has daily read/write quotas; a small-to-medium arcade site should stay well within them, but very high traffic may need the paid (still cheap, pay-as-you-go) plan.
