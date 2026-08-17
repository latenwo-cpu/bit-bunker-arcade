# Getting a downloadable APK for your website

Your project already includes an Android/Capacitor wrapper (app: "Bit Bunker",
package `app.web.bit_bunker.twa`). I added a GitHub Actions workflow
(`.github/workflows/build-apk.yml`) that builds a signed, installable
release APK automatically — you don't need Android Studio or a local
Android SDK.

## One-time setup (~10 minutes)

1. **Create a GitHub repo.**
   Go to https://github.com/new, name it anything (e.g. `bit-bunker-arcade`),
   keep it **Public** (simplest — lets your website link directly to the
   APK) or Private if you prefer, then create it.

2. **Push this project to it.** From this folder, in a terminal:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
   git push -u origin main
   ```
   (If you don't have `git` installed or aren't comfortable with the
   terminal, GitHub's website also lets you drag-and-drop upload a zip of
   this folder under "Add file → Upload files".)

3. **That's it.** Pushing to `main` automatically triggers the workflow.
   Go to the **Actions** tab of your repo and watch it run (~5–8 minutes
   the first time). When it finishes, go to the **Releases** section
   (right sidebar of the repo homepage) and you'll see a release with
   `app-release.apk` attached.

## Linking the APK from your website

GitHub gives every "latest release" a permanent URL, so you can hardcode
one download link that always serves the newest build:

```
https://github.com/YOUR-USERNAME/YOUR-REPO/releases/latest/download/app-release.apk
```

Add a button to `public/index.html` (or wherever your download page is), e.g.:

```html
<a href="https://github.com/YOUR-USERNAME/YOUR-REPO/releases/latest/download/app-release.apk"
   download>
  Download for Android (APK)
</a>
```

Every time you push a change and the workflow reruns, that same link
automatically points to the newest APK.

## About the "unknown sources" warning

Android shows a one-time confirmation prompt when installing any app that
didn't come from the Play Store — this is not a bug or a sign of a
problem with your APK, it's standard behavior for all sideloaded apps.
Users just tap "Install anyway." There's no way to remove this prompt
without publishing through the Play Store or another app store.

## Keeping the same signing key across updates (recommended once you're live)

By default, the workflow generates a fresh signing key on every build if
you haven't provided one. That's fine for getting your first APK, but it
means each build has a *different* signature — so a user who installed an
earlier build would have to uninstall before installing a newer one.

To fix that, generate **one keystore** and reuse it forever:

1. On a machine with Java installed, run:
   ```
   keytool -genkeypair -v -keystore release.keystore -alias bitbunker \
     -keyalg RSA -keysize 2048 -validity 10000
   ```
   (pick your own passwords when prompted — write them down somewhere safe)

2. Convert it to base64:
   ```
   base64 -w0 release.keystore > release.keystore.b64      # Linux/Mac
   certutil -encode release.keystore release.keystore.b64  # Windows
   ```

3. In your GitHub repo: **Settings → Secrets and variables → Actions → New
   repository secret**, and add these four secrets:
   - `RELEASE_KEYSTORE_BASE64` — paste the contents of `release.keystore.b64`
   - `RELEASE_KEYSTORE_PASSWORD` — the keystore password you chose
   - `RELEASE_KEY_ALIAS` — `bitbunker` (or whatever alias you used)
   - `RELEASE_KEY_PASSWORD` — the key password you chose

4. Push any small change (or re-run the workflow manually from the
   Actions tab) — future builds will now reuse this key automatically.

## If you'd rather not use GitHub at all

The project's `public/manifest.json` already makes the site an installable
Progressive Web App — on Android, visiting the site in Chrome and tapping
"Add to Home Screen" installs it with an icon and full-screen behavior,
no APK required. That won't satisfy a literal ".apk file to download,"
but it's worth knowing as a zero-setup alternative if you ever want one.
