# Publishing Pixel Arcade on Google Play

Your project already contains an Android app (Capacitor). The app bundles the website
files inside it, so no separate app code is needed.

> **Important:** the app contains a *copy* of your website (the `www/` folder).
> Always run `npm run android:sync` before building, so the app has your latest files.
> (`www/` is now filled automatically from `public/`; `admin.html` is deliberately left out.)

---

## Step 1 - Play Console account
1. Go to https://play.google.com/console and pay the one-time **$25** fee.
2. **Personal account created after 13 Nov 2023:** Google requires a **closed test with at least
   12 testers, opted in for 14 continuous days**, before you can apply for production.
   Plan ~3 weeks. An *organization* account is exempt.

## Step 2 - Create your signing key (do this once, keep it forever)
```
keytool -genkeypair -v -keystore pixelarcade-upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
```
- Back up `pixelarcade-upload.jks` and both passwords somewhere safe (not in Git).
- Play App Signing is on by default; this is only your *upload* key.

## Step 3 - Build the AAB (pick ONE way)

### A) GitHub Actions (no Android Studio needed)
1. Convert the keystore to text:
   - Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("pixelarcade-upload.jks")) | Set-Clipboard`
   - Mac/Linux: `base64 -w0 pixelarcade-upload.jks`
2. GitHub repo -> Settings -> Secrets and variables -> Actions -> add 4 secrets:
   `ANDROID_KEYSTORE_BASE64` (the text above), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`upload`), `ANDROID_KEY_PASSWORD`
3. Actions tab -> **Build signed AAB for Google Play** -> Run workflow.
   Enter version name (e.g. `1.0`) and version code (`1`, then `2`, `3`... must go up each upload).
4. Download `app-release.aab` from the run's Artifacts.

### B) On your computer (needs Node 22, JDK 21, Android Studio/SDK)
```
npm install
npm run android:sync
```
Create `android/keystore.properties`:
```
storeFile=C:/keys/pixelarcade-upload.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=upload
keyPassword=YOUR_KEY_PASSWORD
```
Then (Windows) `cd android` and `gradlew.bat bundleRelease -PVERSION_CODE=1 -PVERSION_NAME=1.0`
(Mac/Linux: `./gradlew bundleRelease ...`). Output: `android/app/build/outputs/bundle/release/app-release.aab`

**Test first:** push to `main` to run the existing "Build Android APK" workflow, install the APK on a phone
and play a few games, a game-end ad, and check notifications before uploading.

## Step 4 - Deploy Firebase (for the new game-end ads)
```
firebase deploy
```
This publishes the website, `firestore.rules`, and `storage.rules` (enable Storage in the Firebase console first).

## Step 5 - Play Console setup
Create app -> Free -> Game. Then complete the "Set up your app" tasks:

| Task | What to enter |
|---|---|
| Privacy policy URL | `https://pixelarcade-44662.web.app/privacy.html` (deploy first) |
| App access | All functionality available without login |
| Ads | **Yes, contains ads** |
| Target audience | **13+ / 18+ only.** Do NOT pick under-13 (that triggers the strict Families policy) |
| Content rating | Fill the questionnaire honestly (no violence/gambling; online chat = "users can interact") |
| Data safety | See table below |
| Advertising ID | **Yes** (AdMob uses it) |
| Store listing | Name, short + full description, 512x512 icon (`public/icons/icon-512.png`), feature graphic 1024x500 (`feature-graphic.png`), at least 2 phone screenshots |

**Data safety answers (match your privacy policy):**
- Collected: Approximate location (IP-based), App activity (game events), Device/other IDs (random player ID + advertising ID), User-generated content (chat), Email address (Google sign-in on website only), Other in-app actions
- Purposes: Analytics, App functionality, Advertising
- Shared with third parties: advertising ID/ad data with Google (AdMob)
- Encrypted in transit: Yes. Users can request deletion: Yes (policy Section 7)

## Step 6 - Upload
Testing -> **Closed testing** -> Create release -> upload `app-release.aab` -> add 12+ tester emails -> start.
After 14 continuous days, **Apply for production**.

---

## Fix these BEFORE you submit (review risks)

1. **Developer contact email.** Your policy lists `contact@pixelarcade-44662.web.app`. A `.web.app`
   address cannot receive email, and Play requires a working contact. Use a real email (Gmail is fine)
   in both the Play listing and `public/privacy.html`.
2. **Chat needs Report / Block.** Google Play's User Generated Content policy requires an in-app way to
   report and block abusive users for apps with chat. The room chat doesn't have one yet - add it
   (or turn chat off in the app) before submitting.
3. **Use AdMob test ads while testing.** Never click your own live ads. In the code, `isTesting:false`
   is set - register your phone as a test device in AdMob first.
4. **Enter your AdMob unit IDs** in admin -> Ad Settings -> *Google AdMob*, and set the mode to AdMob,
   otherwise the app shows no banners. (Game-end ads work independently of this.)
5. **Google sign-in is disabled inside the app** (Google blocks it in app WebViews). The app tells users
   to use "Continue Anonymously"; Google sign-in still works on the website.
6. **Privacy policy retention claim.** The old text said room data is deleted automatically; the code
   does not do that, so I removed the claim. Only promise what you actually do (including the new
   "delete my data on request" line).
7. **Notifications.** I removed the `SCHEDULE_EXACT_ALARM` permission (Play restricts it). Daily
   reminders still work but may arrive a few minutes late.

## Updating later
- Changes to the **admin panel ads** (Firestore) go live instantly, no new app needed.
- Changes to **game code/HTML** need: `npm run android:sync` -> build a new AAB with a **higher version code** -> upload.
