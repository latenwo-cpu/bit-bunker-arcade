/* =========================================================================
   PIXEL ARCADE — Post-game interstitial ads (image / video / HTML)
   -------------------------------------------------------------------------
   Shown after a game ends (win / lose / draw), configured from the
   "Game-End Ads" tab in admin.html and stored in Firestore at
   config/interstitial. Loaded by index.html and arcade.html with:
       <script src="/interstitial-ads.js" defer></script>
   and triggered from logEvent('game_end') via AdInterstitial.onGameEnd().

   Behaviour:
     - Waits a short delay after the game ends so the player sees the result.
     - Image/HTML ads: show an X (after "skip delay") and auto-close after N sec.
     - Video ads: show an X (after "skip delay") and auto-close when video ends.
     - Closing the ad returns the player to the game's result screen, where
       they can press Play Again as usual.
   ========================================================================= */
(function(){
  'use strict';

  var CFG_DOC = ['config', 'interstitial'];
  var LS_LAST_SHOWN = 'arcade_inter_last_shown';
  var LS_COUNTER = 'arcade_inter_game_counter';
  var LS_SEQ = 'arcade_inter_seq_index';

  var cfg = null;            // loaded config
  var cfgPromise = null;
  var isOpen = false;
  var pendingTimer = null;
  var sessionShown = 0;

  var DEFAULTS = {
    enabled: false,
    showOnWin: true,
    showOnLose: true,
    showOnDraw: false,
    showInOnline: false,
    target: 'both',
    delayMs: 1200,
    everyN: 1,
    cooldownSec: 30,
    maxPerSession: 0,
    rotation: 'random',
    skipAfterSec: 0,
    autoCloseSec: 8,
    ads: []
  };

  /* ---------- helpers ---------- */
  function isNative(){
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  }
  function safeLog(type, data){
    try{ if(typeof logEvent === 'function') logEvent(type, data); }catch(e){}
  }
  function lsGet(k, d){ try{ var v = localStorage.getItem(k); return v === null ? d : v; }catch(e){ return d; } }
  function lsSet(k, v){ try{ localStorage.setItem(k, String(v)); }catch(e){} }

  function loadConfig(){
    if(cfg) return Promise.resolve(cfg);
    if(cfgPromise) return cfgPromise;
    cfgPromise = new Promise(function(resolve){
      var db = null;
      try{ db = (typeof fbDB !== 'undefined') ? fbDB : null; }catch(e){}
      if(!db){ cfg = Object.assign({}, DEFAULTS); resolve(cfg); return; }
      db.collection(CFG_DOC[0]).doc(CFG_DOC[1]).get().then(function(doc){
        cfg = Object.assign({}, DEFAULTS, doc.exists ? doc.data() : {});
        if(!Array.isArray(cfg.ads)) cfg.ads = [];
        resolve(cfg);
      }).catch(function(e){
        console.warn('Interstitial config load failed', e);
        cfg = Object.assign({}, DEFAULTS);
        resolve(cfg);
      });
    });
    return cfgPromise;
  }

  /* Classify a game_end payload into win / lose / draw */
  function classify(data){
    var r = String((data && data.result) || '').toLowerCase();
    if(!r) return 'lose';                       // score-only games (snake, 2048...) = "game over"
    if(r === 'draw' || r === 'tie') return 'draw';
    if(r === 'loss' || r === 'lose' || r === 'cpu_win' || r === 'crash') return 'lose';
    return 'win';                               // win, human_win, solved, finish, RED, X, p1_win...
  }

  function adMatchesContext(ad, outcome, native){
    if(!ad || ad.active === false) return false;
    var t = ad.target || 'both';
    if(t === 'web' && native) return false;
    if(t === 'app' && !native) return false;
    var when = ad.showOn || 'any';              // any | win | lose
    if(when === 'win' && outcome !== 'win') return false;
    if(when === 'lose' && outcome === 'win') return false;
    if(ad.type === 'video' || ad.type === 'image'){ if(!ad.mediaUrl) return false; }
    else if(ad.type === 'html'){ if(!ad.html) return false; }
    else return false;
    return true;
  }

  function pickAd(list){
    if(!list.length) return null;
    if(cfg.rotation === 'sequential'){
      var i = parseInt(lsGet(LS_SEQ, '0'), 10) || 0;
      var ad = list[i % list.length];
      lsSet(LS_SEQ, (i + 1) % 100000);
      return ad;
    }
    return list[Math.floor(Math.random() * list.length)];
  }

  /* ---------- styles (injected once) ---------- */
  function injectStyles(){
    if(document.getElementById('inter-ad-styles')) return;
    var s = document.createElement('style');
    s.id = 'inter-ad-styles';
    s.textContent =
      '#inter-ad-overlay{position:fixed;inset:0;z-index:2147483000;background:rgba(5,7,16,.94);display:flex;align-items:center;justify-content:center;font-family:"JetBrains Mono",monospace;animation:interFade .2s ease-out;}' +
      '@keyframes interFade{from{opacity:0}to{opacity:1}}' +
      '#inter-ad-box{position:relative;width:min(94vw,860px);max-height:92vh;display:flex;flex-direction:column;align-items:center;gap:10px;}' +
      '#inter-ad-label{align-self:flex-start;font-size:11px;letter-spacing:1px;color:#8892b8;text-transform:uppercase;}' +
      '#inter-ad-stage{position:relative;width:100%;background:#000;border:1px solid #2a3363;border-radius:10px;overflow:hidden;display:flex;align-items:center;justify-content:center;max-height:78vh;}' +
      '#inter-ad-stage video,#inter-ad-stage img{display:block;max-width:100%;max-height:78vh;width:auto;height:auto;margin:0 auto;}' +
      '#inter-ad-stage .inter-html{width:100%;max-height:78vh;overflow:auto;padding:12px;color:#e8ecff;}' +
      '#inter-ad-stage a.inter-link{display:block;cursor:pointer;}' +
      '#inter-ad-close{position:absolute;top:8px;right:8px;z-index:3;min-width:38px;height:38px;padding:0 10px;border-radius:19px;border:1px solid rgba(255,255,255,.35);background:rgba(10,14,30,.85);color:#fff;font-size:20px;font-weight:700;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:inherit;}' +
      '#inter-ad-close:hover{border-color:#2de2c8;color:#2de2c8;}' +
      '#inter-ad-close[disabled]{cursor:default;font-size:12px;opacity:.9;}' +
      '#inter-ad-mute{position:absolute;bottom:10px;left:10px;z-index:3;height:34px;padding:0 12px;border-radius:17px;border:1px solid rgba(255,255,255,.35);background:rgba(10,14,30,.85);color:#fff;font-size:13px;cursor:pointer;font-family:inherit;}' +
      '#inter-ad-bar{position:absolute;left:0;right:0;bottom:0;height:4px;background:rgba(255,255,255,.12);z-index:3;}' +
      '#inter-ad-bar i{display:block;height:100%;width:0;background:#2de2c8;}' +
      '#inter-ad-hint{font-size:11px;color:#8892b8;min-height:14px;}';
    document.head.appendChild(s);
  }

  /* ---------- show / close ---------- */
  function show(ad, outcome, gameData){
    if(isOpen) return;
    isOpen = true;
    sessionShown++;
    lsSet(LS_LAST_SHOWN, Date.now());
    injectStyles();

    var skipAfter = ad.skipAfterSec != null && ad.skipAfterSec !== '' ? Number(ad.skipAfterSec) : Number(cfg.skipAfterSec || 0);
    var autoClose = ad.autoCloseSec != null && ad.autoCloseSec !== '' ? Number(ad.autoCloseSec) : Number(cfg.autoCloseSec || 8);
    if(!isFinite(skipAfter) || skipAfter < 0) skipAfter = 0;
    if(!isFinite(autoClose) || autoClose < 1) autoClose = 8;

    var overlay = document.createElement('div');
    overlay.id = 'inter-ad-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Advertisement');

    var box = document.createElement('div');
    box.id = 'inter-ad-box';

    var label = document.createElement('div');
    label.id = 'inter-ad-label';
    label.textContent = 'Advertisement';

    var stage = document.createElement('div');
    stage.id = 'inter-ad-stage';

    var closeBtn = document.createElement('button');
    closeBtn.id = 'inter-ad-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close ad');

    var bar = document.createElement('div');
    bar.id = 'inter-ad-bar';
    var barFill = document.createElement('i');
    bar.appendChild(barFill);

    var hint = document.createElement('div');
    hint.id = 'inter-ad-hint';

    var closed = false;
    var timers = [];
    var videoEl = null;
    var impressionLogged = false;
    var openedAt = Date.now();

    function clearAll(){ timers.forEach(function(t){ clearTimeout(t); clearInterval(t); }); timers = []; }

    function close(reason){
      if(closed) return;
      closed = true;
      clearAll();
      try{ if(videoEl){ videoEl.pause(); videoEl.removeAttribute('src'); videoEl.load(); } }catch(e){}
      if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
      document.removeEventListener('keydown', onKey, true);
      isOpen = false;
      lsSet(LS_LAST_SHOWN, Date.now());
      safeLog('interstitial_close', {
        adId: ad.id, adName: ad.name || '', adType: ad.type, reason: reason,
        watchedSec: Math.round((Date.now() - openedAt) / 100) / 10, game: gameData && gameData.game || null
      });
    }

    function onKey(e){
      if(e.key === 'Escape' && closeBtn && !closeBtn.disabled){ e.stopPropagation(); close('escape'); }
    }
    document.addEventListener('keydown', onKey, true);

    closeBtn.addEventListener('click', function(){ if(!closeBtn.disabled) close('x'); });

    function enableClose(){
      closeBtn.disabled = false;
      closeBtn.textContent = '\u2715';
      closeBtn.style.fontSize = '';
    }

    /* X button: disabled with countdown until skipAfter seconds have passed */
    if(skipAfter > 0){
      closeBtn.disabled = true;
      var left = Math.ceil(skipAfter);
      closeBtn.textContent = String(left);
      var iv = setInterval(function(){
        left--;
        if(left <= 0){ clearInterval(iv); enableClose(); }
        else closeBtn.textContent = String(left);
      }, 1000);
      timers.push(iv);
    } else {
      enableClose();
    }

    function logImpression(){
      if(impressionLogged) return;
      impressionLogged = true;
      safeLog('interstitial_impression', {
        adId: ad.id, adName: ad.name || '', adType: ad.type, outcome: outcome,
        game: gameData && gameData.game || null, mode: gameData && gameData.mode || null
      });
    }

    function wrapWithLink(node){
      if(!ad.linkUrl) return node;
      var a = document.createElement('a');
      a.className = 'inter-link';
      a.href = ad.linkUrl;
      a.target = '_blank';
      a.rel = 'noopener sponsored';
      a.addEventListener('click', function(){
        safeLog('interstitial_click', { adId: ad.id, adName: ad.name || '', adType: ad.type, game: gameData && gameData.game || null });
      });
      a.appendChild(node);
      return a;
    }

    function startTimedAutoClose(seconds){
      var total = seconds * 1000, t0 = Date.now();
      hint.textContent = 'Closing in ' + Math.ceil(seconds) + 's\u2026';
      var iv = setInterval(function(){
        var el = Date.now() - t0;
        barFill.style.width = Math.min(100, el / total * 100) + '%';
        hint.textContent = 'Closing in ' + Math.max(0, Math.ceil((total - el) / 1000)) + 's\u2026';
        if(el >= total){ clearInterval(iv); close('auto'); }
      }, 100);
      timers.push(iv);
    }

    if(ad.type === 'video'){
      videoEl = document.createElement('video');
      videoEl.playsInline = true;
      videoEl.setAttribute('playsinline', '');
      videoEl.setAttribute('webkit-playsinline', '');
      videoEl.preload = 'auto';
      videoEl.controls = false;
      videoEl.disablePictureInPicture = true;
      if(ad.posterUrl) videoEl.poster = ad.posterUrl;
      videoEl.src = ad.mediaUrl;
      videoEl.muted = ad.muted === true;

      var muteBtn = document.createElement('button');
      muteBtn.id = 'inter-ad-mute';
      muteBtn.type = 'button';
      function paintMute(){ muteBtn.textContent = videoEl.muted ? '\uD83D\uDD07 Unmute' : '\uD83D\uDD0A Mute'; }
      muteBtn.addEventListener('click', function(e){ e.stopPropagation(); e.preventDefault(); videoEl.muted = !videoEl.muted; paintMute(); });

      stage.appendChild(wrapWithLink(videoEl));
      stage.appendChild(muteBtn);

      videoEl.addEventListener('playing', function(){ logImpression(); });
      videoEl.addEventListener('timeupdate', function(){
        if(videoEl.duration && isFinite(videoEl.duration)){
          barFill.style.width = Math.min(100, videoEl.currentTime / videoEl.duration * 100) + '%';
          hint.textContent = 'Closing when the video ends\u2026';
        }
      });
      videoEl.addEventListener('ended', function(){
        safeLog('interstitial_complete', { adId: ad.id, adName: ad.name || '', adType: 'video', game: gameData && gameData.game || null });
        close('ended');
      });
      videoEl.addEventListener('error', function(){
        console.warn('Interstitial video failed to load', ad.mediaUrl);
        close('error');
      });

      var p = videoEl.play();
      if(p && p.catch){
        p.catch(function(){
          // Autoplay with sound was blocked — retry muted so the ad still plays.
          videoEl.muted = true; paintMute();
          var p2 = videoEl.play();
          if(p2 && p2.catch) p2.catch(function(){ close('blocked'); });
        });
      }
      paintMute();

      // Safety net: never let a stuck/very long video trap the player.
      var cap = Number(ad.maxVideoSec || 0);
      if(cap > 0){ timers.push(setTimeout(function(){ close('max-length'); }, cap * 1000)); }
      // If the video never starts within 8s (bad URL / slow connection), skip the ad.
      timers.push(setTimeout(function(){ if(!impressionLogged) close('timeout'); }, 8000));
    }
    else if(ad.type === 'image'){
      var img = document.createElement('img');
      img.alt = 'Advertisement';
      img.addEventListener('load', function(){ logImpression(); startTimedAutoClose(autoClose); });
      img.addEventListener('error', function(){ close('error'); });
      img.src = ad.mediaUrl;
      stage.appendChild(wrapWithLink(img));
    }
    else if(ad.type === 'html'){
      var wrap = document.createElement('div');
      wrap.className = 'inter-html';
      wrap.innerHTML = ad.html;
      wrap.querySelectorAll('a').forEach(function(a){
        a.target = '_blank'; a.rel = 'noopener sponsored';
        a.addEventListener('click', function(){
          safeLog('interstitial_click', { adId: ad.id, adName: ad.name || '', adType: 'html', game: gameData && gameData.game || null });
        });
      });
      stage.appendChild(wrap);
      logImpression();
      startTimedAutoClose(autoClose);
    }

    stage.appendChild(closeBtn);
    stage.appendChild(bar);
    box.appendChild(label);
    box.appendChild(stage);
    box.appendChild(hint);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  /* ---------- public entry point ---------- */
  function onGameEnd(data){
    if(isOpen || pendingTimer) return;
    data = data || {};

    loadConfig().then(function(c){
      if(!c || !c.enabled || !c.ads || !c.ads.length) return;

      var native = isNative();
      var t = c.target || 'both';
      if(t === 'web' && native) return;
      if(t === 'app' && !native) return;

      if(data.mode === 'online' && !c.showInOnline) return;

      var outcome = classify(data);
      if(outcome === 'win' && !c.showOnWin) return;
      if(outcome === 'lose' && !c.showOnLose) return;
      if(outcome === 'draw' && !c.showOnDraw) return;

      // Frequency: only every Nth finished game
      var n = Math.max(1, parseInt(c.everyN, 10) || 1);
      var counter = (parseInt(lsGet(LS_COUNTER, '0'), 10) || 0) + 1;
      lsSet(LS_COUNTER, counter);
      if(counter % n !== 0) return;

      // Cooldown (also protects against duplicate game_end events)
      var cool = Math.max(0, Number(c.cooldownSec) || 0) * 1000;
      var last = parseInt(lsGet(LS_LAST_SHOWN, '0'), 10) || 0;
      if(cool && Date.now() - last < cool) return;

      var cap = parseInt(c.maxPerSession, 10) || 0;
      if(cap > 0 && sessionShown >= cap) return;

      var eligible = c.ads.filter(function(ad){ return adMatchesContext(ad, outcome, native); });
      var ad = pickAd(eligible);
      if(!ad) return;

      var delay = Math.max(0, Number(c.delayMs) || 0);
      pendingTimer = setTimeout(function(){
        pendingTimer = null;
        show(ad, outcome, data);
      }, delay);
    });
  }

  // Warm the config as soon as the page is ready so the first ad isn't delayed.
  function warm(){ setTimeout(loadConfig, 1500); }
  if(document.readyState === 'complete') warm(); else window.addEventListener('load', warm);

  window.AdInterstitial = {
    onGameEnd: onGameEnd,
    // Admin "Preview" / debugging helper: AdInterstitial.preview(adObject)
    preview: function(ad){ loadConfig().then(function(c){ cfg = c || Object.assign({}, DEFAULTS); show(ad, 'win', {game:'preview'}); }); }
  };
})();


/* =========================================================================
   PIXEL ARCADE — Chat safety: profanity filter + Report + Block
   Lives in this file so index.html and arcade.html need no edits.
   It replaces sendChatMessage() and renderChatMessages() with safe versions.
   - Bad words are masked (****) before sending and again when displayed.
   - Every message from the other player gets Report and Block buttons.
   - Block hides that player's messages on this device (saved locally).
   - Report saves the message to Firestore "reports" (read it in the Firebase
     Console) and also blocks that player.
   ========================================================================= */
(function(){
  'use strict';

  var BLOCK_KEY = 'arcade_blocked_uids_v1';

  /* ---------- profanity filter ---------- */
  // Matched anywhere inside a word.
  var STRONG = [
    'fuck','shit','bitch','asshole','bastard','whore','slut','nigg',
    'retard','motherfuck','dickhead','pussy','cocksuck','blowjob',
    'madarchod','bhenchod','behenchod','chutiya','gandu'
  ];
  // Matched only as whole words (short words that appear inside normal words).
  var WHOLE = ['cunts?','dick','cock','fag','faggot','porn','rape','rapist','cum','kys','tits'];
  // Phrases.
  var PHRASES = [/kill\s*y(?:our|o)?\s*self/g];

  var strongRe = new RegExp('(?:' + STRONG.join('|') + ')', 'g');
  var wholeRe = new RegExp('\\b(?:' + WHOLE.join('|') + ')\\b', 'g');

  function normalize(s){
    // Same length as the original so match positions line up.
    return s.toLowerCase()
      .replace(/[@4]/g,'a').replace(/0/g,'o').replace(/[1!|]/g,'i')
      .replace(/3/g,'e').replace(/[$5]/g,'s').replace(/7/g,'t');
  }
  function mask(text){
    var original = String(text == null ? '' : text);
    var norm = normalize(original);
    var chars = original.split('');
    function run(re){
      re.lastIndex = 0;
      var m;
      while((m = re.exec(norm)) !== null){
        if(m[0].length === 0){ re.lastIndex++; continue; }
        for(var i = m.index; i < m.index + m[0].length; i++) chars[i] = '*';
      }
    }
    run(strongRe); run(wholeRe);
    for(var p = 0; p < PHRASES.length; p++) run(PHRASES[p]);
    return chars.join('');
  }
  window.ArcadeChatMask = mask;

  /* ---------- block list ---------- */
  function getBlocked(){
    try{ return JSON.parse(localStorage.getItem(BLOCK_KEY) || '[]'); }catch(e){ return []; }
  }
  function saveBlocked(list){
    try{ localStorage.setItem(BLOCK_KEY, JSON.stringify(list)); }catch(e){}
  }
  function isBlocked(uid){ return !!uid && getBlocked().indexOf(uid) !== -1; }
  function blockUid(uid){
    if(!uid) return;
    var list = getBlocked();
    if(list.indexOf(uid) === -1){ list.push(uid); saveBlocked(list); }
  }

  /* ---------- small helpers ---------- */
  var lastMsgs = [];
  var lastRole = null;

  function esc(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function toast(text){
    var t = document.createElement('div');
    t.textContent = text;
    t.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);' +
      'background:#111827;color:#fff;padding:9px 14px;border-radius:8px;font-size:13px;' +
      'z-index:99999;max-width:80vw;text-align:center;box-shadow:0 4px 14px rgba(0,0,0,.4);';
    document.body.appendChild(t);
    setTimeout(function(){ if(t.parentNode) t.parentNode.removeChild(t); }, 2600);
  }
  function sendReport(m){
    try{
      if(typeof FIREBASE_ENABLED !== 'undefined' && FIREBASE_ENABLED &&
         typeof fbDB !== 'undefined' && fbDB){
        fbDB.collection('reports').add({
          type: 'chat',
          room: (typeof OnlineRoom !== 'undefined' && OnlineRoom.getCode) ? (OnlineRoom.getCode() || null) : null,
          msgId: m.id || null,
          uid: m.uid || null,
          sender: m.sender || null,
          text: String(m.text || '').slice(0, 300),
          ts: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(function(e){ console.warn('report failed', e); });
      }
    }catch(e){ console.warn('report failed', e); }
  }

  /* ---------- panel extras (rules line + unblock link) ---------- */
  function ensureExtras(){
    var panel = document.getElementById('chat-panel');
    if(!panel) return;
    var bar = document.getElementById('chat-safety-bar');
    if(!bar){
      var row = panel.querySelector('.chat-input-row');
      if(!row) return;
      bar = document.createElement('div');
      bar.id = 'chat-safety-bar';
      bar.style.cssText = 'padding:4px 10px;font-size:10.5px;color:var(--text-dim);' +
        'border-top:1px solid var(--border);display:flex;justify-content:space-between;gap:8px;';
      panel.insertBefore(bar, row);
      bar.addEventListener('click', function(e){
        if(e.target && e.target.id === 'chat-unblock-all'){
          saveBlocked([]);
          toast('Unblocked everyone');
          renderChatMessages(lastMsgs, lastRole);
        }
      });
    }
    var n = getBlocked().length;
    bar.innerHTML = '<span>Be kind. Report or block anyone who is rude.</span>' +
      (n ? '<a href="#" id="chat-unblock-all" onclick="return false;" style="color:var(--cyan);">Unblock all (' + n + ')</a>' : '');
  }

  function ensureLogHandler(){
    var log = document.getElementById('chat-log');
    if(!log || log.getAttribute('data-mod') === '1') return;
    log.setAttribute('data-mod', '1');
    log.addEventListener('click', function(e){
      var btn = e.target;
      if(!btn || !btn.getAttribute) return;
      var action = btn.getAttribute('data-act');
      if(!action) return;
      var id = btn.getAttribute('data-id');
      var m = null;
      for(var i = 0; i < lastMsgs.length; i++){ if(lastMsgs[i].id === id){ m = lastMsgs[i]; break; } }
      if(!m) return;
      if(action === 'report'){
        if(!window.confirm('Report this message and block this player?')) return;
        sendReport(m);
        blockUid(m.uid);
        toast('Reported and blocked. Thank you.');
      } else if(action === 'block'){
        if(!window.confirm('Block this player? You will not see their messages.')) return;
        blockUid(m.uid);
        toast('Player blocked');
      }
      renderChatMessages(lastMsgs, lastRole);
    });
  }

  /* ---------- replacement: render ---------- */
  function renderChatMessages(msgs, role){
    var log = document.getElementById('chat-log');
    if(!log) return;
    msgs = msgs || [];
    lastMsgs = msgs; lastRole = role;
    ensureLogHandler();
    ensureExtras();

    var newFromFriend = 0;
    msgs.forEach(function(m){
      if(!chatKnownIds.has(m.id)){
        chatKnownIds.add(m.id);
        if(m.sender && m.sender !== role && !isBlocked(m.uid)) newFromFriend++;
      }
    });

    log.innerHTML = msgs.map(function(m){
      var mine = m.sender === role;
      if(!mine && isBlocked(m.uid)) return '';
      var who = mine ? 'You' : 'Friend';
      var body = esc(mask(m.text || ''));
      var actions = '';
      if(!mine){
        var id = esc(m.id || '');
        actions = '<span style="display:block;margin-top:3px;font-size:10px;">' +
          '<a href="#" data-act="report" data-id="' + id + '" onclick="return false;" style="color:#ff6b6b;margin-right:10px;">Report</a>' +
          '<a href="#" data-act="block" data-id="' + id + '" onclick="return false;" style="color:var(--text-dim);">Block</a>' +
          '</span>';
      }
      return '<div class="chat-msg ' + (mine ? 'me' : 'them') + '"><span class="chat-who">' + who + '</span>' + body + actions + '</div>';
    }).join('');
    log.scrollTop = log.scrollHeight;

    if(newFromFriend > 0 && !chatOpen){
      chatUnread += newFromFriend;
      updateChatBadge();
    }
  }

  /* ---------- replacement: send ---------- */
  async function sendChatMessage(){
    var input = document.getElementById('chat-input');
    if(!input) return;
    var text = input.value;
    if(!text || !text.trim()) return;
    var btn = document.getElementById('chat-send-btn');
    if(btn) btn.disabled = true;
    input.value = '';
    var clean = mask(text);
    var ok = await OnlineRoom.sendChat(clean);
    if(btn) btn.disabled = false;
    if(!ok) input.value = text;
    input.focus();
  }

  window.renderChatMessages = renderChatMessages;
  window.sendChatMessage = sendChatMessage;
})();