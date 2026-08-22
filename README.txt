Replace your project's public/index.html and www/index.html with these.

What changed: the "Get it on Android" button now points to your GitHub
Releases asset instead of the local /downloads/ path:
https://github.com/latenwo-cpu/bit-bunker-arcade/releases/download/build-11/app-release.apk

This keeps public/ free of any .apk file, so `firebase deploy` will succeed
on the Spark plan, while the download button still works for visitors.

Reminder: make sure the actual .apk file is NOT sitting in public/downloads/
or www/downloads/ anymore (see earlier steps) - only the link should point
to GitHub now, the binary itself should live in the GitHub release, not in
your Firebase-deployed folder.
