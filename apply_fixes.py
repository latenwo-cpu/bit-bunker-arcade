#!/usr/bin/env python3
"""
Pixel Arcade - Google Play compliance fixes.

Usage:   python3 apply_fixes.py <path-to-public-folder> [path-to-lib-folder]

Run it on every copy of your web files (public/, www/, and
android/app/src/main/assets/public/). It is safe to run twice.
"""
import pathlib, re, shutil, sys

root = pathlib.Path(sys.argv[1]).resolve()
libs = pathlib.Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else None
changed = {}


def note(name):
    changed[name] = changed.get(name, 0) + 1


def read(p):
    with open(p, encoding="utf8", newline="") as f:
        return f.read()


def write(p, s):
    with open(p, "w", encoding="utf8", newline="") as f:
        f.write(s)


def sub_once(text, old, new, label, required=True):
    """Replace exactly one occurrence, tolerant of CRLF files."""
    crlf = "\r\n" in text
    o = old.replace("\n", "\r\n") if crlf else old
    n = new.replace("\n", "\r\n") if crlf else new
    if n in text:
        return text  # already applied
    if text.count(o) != 1:
        if required:
            raise SystemExit("PATCH FAILED (%s): found %d matches" % (label, text.count(o)))
        return text
    note(label)
    return text.replace(o, n)


text_files = [p for p in root.rglob("*")
              if p.is_file() and p.suffix in (".html", ".js", ".json", ".xml", ".txt")
              and "lib" not in p.relative_to(root).parts]

# ---------------------------------------------------------------- 1. names
RENAMES = [
    ("Connect Four", "Four in a Row"), ("CONNECT FOUR", "FOUR IN A ROW"),
    ("Battleship", "Sea Battle"), ("BATTLESHIP", "SEA BATTLE"),
    ("Breakout", "Brick Smash"), ("BREAKOUT", "BRICK SMASH"),
    ("Minesweeper", "Mine Finder"), ("MINESWEEPER", "MINE FINDER"),
    ("Simon Says", "Color Echo"), ("SIMON SAYS", "COLOR ECHO"),
    ("Whack-a-Mole", "Mole Smash"), ("Whack-A-Mole", "Mole Smash"), ("WHACK-A-MOLE", "MOLE SMASH"),
    ("Pong", "Paddle Duel"), ("PONG", "PADDLE DUEL"),
]
for p in text_files:
    s = read(p)
    orig = s
    for old, new in RENAMES:
        s = re.sub(r"(?<![A-Za-z0-9_])" + re.escape(old) + r"(?![A-Za-z0-9_])", new, s)
    if s != orig:
        write(p, s)
        note("renamed trademarked names")

# --------------------------------------------- 2. bundle libraries locally
SWAPS = {
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js": "/lib/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js": "/lib/firebase-auth-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js": "/lib/firebase-firestore-compat.js",
    "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js": "/lib/three.min.js",
}
for p in root.glob("*.html"):
    s = read(p)
    o = s
    for a, b in SWAPS.items():
        s = s.replace(a, b)
    if s != o:
        write(p, s)
        note("local libraries")
if libs and libs.exists():
    (root / "lib").mkdir(exist_ok=True)
    for f in libs.glob("*.js"):
        shutil.copy2(f, root / "lib" / f.name)

for name in ("index.html", "arcade.html"):
    p = root / name
    if not p.exists():
        continue
    s = read(p)

    # ---------------------------------------------- 3. chat rate limit
    s = sub_once(
        s,
        "async function sendChat(text){\n    if(!code) return false;\n",
        "async function sendChat(text){\n    if(!code) return false;\n"
        "    { const _n=Date.now(); if(_n-(sendChat._last||0)<1500) return false; sendChat._last=_n; } // anti-spam: 1 message / 1.5s\n",
        name + ": chat rate limit")

    # ------------------------------------------ 4. in-app data deletion
    s = sub_once(
        s,
        "  function renderScreen(){\n    const card=document.getElementById('cloud-save-card');",
        "  function renderScreenBase(){\n    const card=document.getElementById('cloud-save-card');",
        name + ": cloud card rename")
    delete_js = r"""  /* ---- Delete my online data (Google Play account/data deletion requirement) ---- */
  async function deleteMyData(){
    if(!available()){ showToast('Needs an internet connection and Firebase.'); return; }
    if(!confirm("Delete your online data?\n\nThis permanently removes your cloud save, leaderboard entries, friends list and player profile from our servers. Progress stored on this device is not affected.\n\nIf you play online again later, new entries will be created.\n\nThis cannot be undone.")) return;
    try{
      const uid=getUserId();
      let code=null; try{ code=OnlineRoom.getUserCode(); }catch(e){}
      const ops=[];
      if(user && user.uid) ops.push(docRef(user.uid).delete());
      if(typeof GAME_META!=='undefined'){
        Object.keys(GAME_META).forEach(gid=>{
          ops.push(fbDB.collection('leaderboards').doc(gid).collection('scores').doc(uid).delete());
        });
      }
      if(code){
        const friends=await fbDB.collection('players').doc(code).collection('friends').get();
        friends.forEach(d=>ops.push(d.ref.delete()));
        ops.push(fbDB.collection('players').doc(code).delete());
      }
      await Promise.all(ops);
      const auth=ensureAuth();
      if(auth && auth.currentUser){
        try{ await auth.currentUser.delete(); }
        catch(e){ try{ await auth.signOut(); }catch(e2){} }
      }
      user=null;
      try{ localStorage.removeItem(LAST_SYNC_KEY); }catch(e){}
      checkedUids.clear();
      renderScreen();
      showToast('Your online data was deleted.');
    }catch(e){
      console.warn('Delete data failed', e);
      showToast('Could not delete right now - check your connection and try again.');
    }
  }
  function addDeleteUi(){
    const card=document.getElementById('cloud-save-card');
    if(!card || !available()) return;
    const wrap=document.createElement('div');
    wrap.style.cssText='margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.12);text-align:center;';
    wrap.innerHTML='<p class="shop-hint">Privacy: permanently delete the data we store online for you (cloud save, leaderboard entries, friends list). Progress on this device is kept. <a href="/delete-data.html" style="color:inherit;text-decoration:underline;">Learn more</a></p>'+
      '<button class="icon-btn" onclick="CloudSave.deleteMyData()">\uD83D\uDDD1 Delete my online data</button>';
    card.appendChild(wrap);
  }
  function renderScreen(){ renderScreenBase(); addDeleteUi(); }

"""
    s = sub_once(
        s,
        "  function init(){\n    renderScreen();\n    if(!available()) return;\n    const auth=ensureAuth();",
        delete_js + "  function init(){\n    renderScreen();\n    if(!available()) return;\n    const auth=ensureAuth();",
        name + ": delete data UI")
    s = sub_once(
        s,
        "return { init, signInGoogle, signInAnon, signOutUser, queuePush, renderScreen };",
        "return { init, signInGoogle, signInAnon, signOutUser, queuePush, renderScreen, deleteMyData };",
        name + ": expose deleteMyData")
    write(root / name, s)

# ------------------------------------------- 5. report: add reporter id
p = root / "chat-moderation.js"
if p.exists():
    s = read(p)
    s = sub_once(
        s,
        "          type: 'chat',\n          room:",
        "          type: 'chat',\n          reporter: (typeof getUserId === 'function') ? getUserId() : null,\n          room:",
        "chat-moderation: reporter id")
    write(p, s)

# ---------------------------- 6. ads: never default to test mode in release
p = root / "interstitial-ads.js"
if p.exists():
    s = read(p)
    s = sub_once(s, "var DEF = { enabled: false, testMode: true,", "var DEF = { enabled: false, testMode: false,",
                 "interstitial default testMode=false")
    write(p, s)

# ------------------------------------------------------------ 7. legal pages
p = root / "privacy.html"
if p.exists():
    s = read(p)
    s = s.replace("Last updated: October 5, 2026", "Last updated: October 19, 2026")
    s = sub_once(
        s,
        "<li><strong>Deleting your data:</strong> to request deletion of your Cloud Save and any analytics linked to your player ID, email us (Section 9) with the ID shown in the app, or the Google account you used, and we will delete it.</li>",
        "<li><strong>Deleting your data:</strong> in the app or website, open <em>Profile &rarr; Cloud Save &rarr; Delete my online data</em> to permanently remove your cloud save, leaderboard entries, friends list and player profile. You can also request deletion without the app on our <a href=\"/delete-data.html\">data deletion page</a> or by email (Section 9) with the ID shown in the app or the Google account you used; we delete it within 30 days. Uninstalling the app removes data stored on your device.</li>",
        "privacy: deletion text")
    write(p, s)

p = root / "terms.html"
if p.exists():
    s = read(p)
    s = s.replace("Last updated: October 9, 2026", "Last updated: October 19, 2026")
    s = sub_once(
        s,
        "<h2>No warranty</h2>",
        "<h2>Reporting abuse</h2><p>Every chat message from another player has Report and Block buttons. Reports are reviewed by us, normally within 48 hours; we remove abusive content and may block offenders. You can also email us from the <a href=\"/contact.html\">contact page</a>.</p><h2>No warranty</h2>",
        "terms: reporting clause")
    write(p, s)

delete_page = """<!DOCTYPE html><html lang="en"><head>
<script src="/capacitor-shim.js"></script>
<script src="/consent.js" data-links-only></script><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Delete your data — Pixel Arcade</title><meta name="description" content="How to delete the data Pixel Arcade stores about you."><link rel="canonical" href="https://pixelarcade-44662.web.app/delete-data.html"><link rel="icon" type="image/svg+xml" href="/pixelarcade-icon.svg">
<style>body{margin:0;background:#0b0e1a;color:#e8ecff;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.7}.w{max-width:760px;margin:0 auto;padding:36px 20px 60px}a{color:#2de2c8}h1{font-size:26px}h2{font-size:18px;margin-top:28px}p,li{color:#b9c1e6}footer{margin-top:40px;border-top:1px solid #2a3363;padding-top:18px;text-align:center;font-size:13px}</style></head><body><div class="w"><h1>Delete your Pixel Arcade data</h1>
<p>Pixel Arcade needs no account to play. If you used optional online features, you can delete everything we store about you online.</p>
<h2>What gets deleted</h2>
<ul><li>Your Cloud Save (XP, coins, achievements, high scores, shop items)</li><li>Your leaderboard entries and display name</li><li>Your player profile and friends list</li><li>The anonymous sign-in account linked to your Cloud Save</li></ul>
<h2>Option 1 &mdash; in the app or website (instant)</h2>
<ol><li>Open Pixel Arcade and tap <strong>Profile</strong>.</li><li>In the <strong>Cloud Save</strong> card, tap <strong>Delete my online data</strong>.</li><li>Confirm. Your online data is removed immediately.</li></ol>
<h2>Option 2 &mdash; by email</h2>
<p>If you no longer have the app, email <a href="mailto:pixelarcadesupport@gmail.com?subject=Delete%20my%20Pixel%20Arcade%20data">pixelarcadesupport@gmail.com</a> with the subject &ldquo;Delete my Pixel Arcade data&rdquo; and, if you can, the player ID shown in the app or the Google account you used on the website. We will delete your data within 30 days and confirm by email.</p>
<h2>Other data</h2>
<p>Progress saved only on your device is removed by clearing the app's storage or uninstalling. Anonymous gameplay analytics are not linked to your identity. See our <a href="/privacy.html">Privacy Policy</a> for details.</p>
<footer><a href="/">Home</a> · <a href="/about.html">About</a> · <a href="/contact.html">Contact</a> · <a href="/terms.html">Terms</a> · <a href="/privacy.html">Privacy Policy</a><span> · </span><a href="#" data-pa-privacy-choices style="display:none">Privacy &amp; ad choices</a><p>© 2026 Pixel Arcade</p></footer></div></body></html>
"""
write(root / "delete-data.html", delete_page)
note("delete-data.html page")

p = root / "sitemap.xml"
if p.exists():
    s = read(p)
    if "delete-data.html" not in s:
        s = s.replace("</urlset>", "  <url><loc>https://pixelarcade-44662.web.app/delete-data.html</loc><lastmod>2026-10-19</lastmod></url>\n</urlset>")
        write(p, s)
        note("sitemap")

print("Done. Changes applied:")
for k, v in sorted(changed.items()):
    print("  - %s (x%d)" % (k, v))
