# Pixel Arcade - Play Store release checklist

## What was fixed in this package
| Issue | Fix |
|---|---|
| Trademarked game names | Battleship -> **Sea Battle**, Connect Four -> **Four in a Row**, Simon Says -> **Color Echo**, Minesweeper -> **Mine Finder**, Pong -> **Paddle Duel**, Breakout -> **Brick Smash**, Whack-a-Mole -> **Mole Smash** (all visible text, titles, descriptions, leaderboards). File names/URLs unchanged. |
| No in-app data deletion | Profile -> Cloud Save -> **Delete my online data** (removes cloud save, leaderboard entries, friends list, player profile, anonymous account). New web page `/delete-data.html` (use this URL in Play Console). Privacy policy + terms updated. |
| AdMob test mode | Default is now **testMode = false**. Ads only show when your real unit IDs are set in admin -> Ad Settings. |
| Advertising ID | `AD_ID` permission declared in the manifest. |
| Chat / reports | 1.5 s send limit, reports now include reporter ID, strict report validation in Firestore rules, "Reporting abuse" clause in Terms. |
| Offline / broken 3D games | three.js and Firebase SDK are bundled in `/lib` (no CDN needed to load). |
| Open database rules | Validated shapes/limits for chat, leaderboards, players, reports, events (see `firestore.rules`). |

## Deploy (in this order)
1. Copy this package's `public/` **over** your project's `public/` (do not replace the folder - your `admin.html` is not in this package). Also run
   `python3 apply_fixes.py <your-www-folder> lib` if you keep a separate `www/`.
2. `firebase deploy --only firestore:rules,hosting` and test: join a room, chat, submit a score, add a friend, delete data.
3. `npm run android:sync`, then build the AAB with a **higher version code**.

## Before every release
- Admin -> Ad Settings -> AdMob: **Test mode OFF**, real banner/interstitial unit IDs entered.
- Register your own phone as a test device in AdMob. **Never tap your own live ads** (invalid traffic = account ban).
- Check Firebase Console -> Firestore -> `reports` **at least every 48 h** and delete/ban abusive content (Play's UGC policy requires you to act on reports).

## Play Console answers
- **Privacy policy URL:** https://pixelarcade-44662.web.app/privacy.html
- **Account/data deletion URL:** https://pixelarcade-44662.web.app/delete-data.html (also say users can delete in-app)
- **Ads:** Yes. **Advertising ID:** Yes (Advertising + Analytics).
- **Target audience:** 13+ (or 18+). Not under 13.
- **Content rating:** answer honestly - users can interact online (chat); virtual coins/spin wheel with no real-money value.
- **Data safety - collected:**
  - Approximate location (IP-based, via ipapi.co) - Analytics - **shared** with ipapi.co (service provider)
  - App activity / in-app actions - Analytics, App functionality
  - Device or other IDs (random player ID + advertising ID) - Advertising, Analytics - advertising ID **shared** with Google AdMob
  - User-generated content (chat messages, display name) - App functionality
  - Email (website Google sign-in only; not collected in the app)
  - Game progress (Cloud Save) - App functionality
  - Encrypted in transit: Yes. Deletion: Yes (in-app + web URL).
- **Store listing:** use the new game names above; do not mention Hasbro/Atari/Microsoft/Konami brands or say "clone of".
