/* =========================================================================
   PIXEL ARCADE — patch for index.html + arcade.html
   1) Menu button moved to the top-left corner (mobile + laptop)
   2) AdMob interstitials: after win, after loss, after 5+ min of play,
      every N hub returns. Native app only. Config: Firestore config/admobInter
   ========================================================================= */
(function () {
  'use strict';

  /* ---------- 1) MENU BUTTON -> SIDE ---------- */
  (function menuFix() {
    if (document.getElementById('pa-menu-fix')) return;
    var s = document.createElement('style');
    s.id = 'pa-menu-fix';
    s.textContent =
      '.hub-header{position:relative;}' +
      '.hub-header .hub-toolbar{position:absolute;top:calc(env(safe-area-inset-top,0px) + 10px);' +
      'left:12px;right:auto;padding:0!important;gap:8px;justify-content:flex-start;' +
      'flex-wrap:nowrap;z-index:50;}';
    document.head.appendChild(s);
  })();

  /* ---------- 2) ADMOB INTERSTITIALS ---------- */
  var P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AdMob;
  var native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (!native || !P) return; // browser: nothing more to do

  var TEST_UNIT = 'ca-app-pub-3940256099942364/1033173712'; // Google's official test interstitial
  var DEF = {
    enabled: false, testMode: true, units: {},
    onWin: true, onLose: true, onDraw: false,
    everyN: 2, cooldownSec: 90, maxPerSession: 12, graceGames: 1,
    timeEnabled: true, timeMin: 5, hubEveryN: 0, delayMs: 1200
  };

  var cfg = null, inited = null, busy = false;
  var shown = 0, games = 0, hubCount = 0, lastShown = 0, playMs = 0, t0 = 0, pending = null;

  function safeLog(t, d) { try { if (typeof window.logEvent === 'function') window.logEvent(t, d); } catch (e) {} }
  function ensureInit() { if (!inited) inited = P.initialize({}).catch(function () {}); return inited; }

  function loadCfg() {
    if (cfg) return Promise.resolve(cfg);
    return new Promise(function (resolve) {
      var db = null;
      try { db = (typeof fbDB !== 'undefined') ? fbDB : null; } catch (e) {}
      if (!db) { cfg = Object.assign({}, DEF); return resolve(cfg); }
      db.collection('config').doc('admobInter').get().then(function (d) {
        cfg = Object.assign({}, DEF, d.exists ? d.data() : {});
        cfg.units = cfg.units || {};
        resolve(cfg);
      }).catch(function () { cfg = Object.assign({}, DEF); resolve(cfg); });
    });
  }

  function classify(data) {
    var r = String((data && data.result) || '').toLowerCase();
    if (!r) return 'lose';
    if (r === 'draw' || r === 'tie') return 'draw';
    if (r === 'loss' || r === 'lose' || r === 'cpu_win' || r === 'crash') return 'lose';
    return 'win';
  }

  ['interstitialAdDismissed', 'interstitialAdFailedToShow'].forEach(function (ev) {
    try { P.addListener(ev, function () { busy = false; }); } catch (e) {}
  });

  function canShow() {
    if (!cfg || !cfg.enabled || busy) return false;
    if (games <= (cfg.graceGames | 0)) return false;
    if (Date.now() - lastShown < (cfg.cooldownSec || 0) * 1000) return false;
    if (cfg.maxPerSession > 0 && shown >= cfg.maxPerSession) return false;
    if (document.getElementById('inter-ad-overlay')) return false; // image/video ad already open
    return true;
  }

  async function show(slot, extra) {
    var id = cfg.testMode ? TEST_UNIT : (cfg.units[slot] || cfg.units.any);
    if (!id || !canShow()) return false;
    busy = true;
    setTimeout(function () { busy = false; }, 60000); // safety release
    try {
      await ensureInit();
      await P.prepareInterstitial({ adId: id, isTesting: !!cfg.testMode });
      await P.showInterstitial();
      shown++; lastShown = Date.now(); playMs = 0;
      safeLog('admob_interstitial', Object.assign({ slot: slot }, extra || {}));
      return true;
    } catch (e) {
      busy = false;
      console.warn('AdMob interstitial failed', slot, e);
      return false;
    }
  }

  function bank() { if (t0) { playMs += Date.now() - t0; t0 = 0; } }
  function timeDue() { return cfg && cfg.timeEnabled && playMs >= (cfg.timeMin || 5) * 60000; }
  function onStart() { if (!t0) t0 = Date.now(); }

  function onEnd(data) {
    bank(); games++;
    loadCfg().then(function () {
      if (!cfg.enabled) return;
      if (data && data.mode === 'online') return;
      var outcome = classify(data), slot = null;
      if (timeDue()) {
        slot = 'timeout';                         // played 5+ min -> this ad wins
      } else {
        if (outcome === 'win' && !cfg.onWin) return;
        if (outcome === 'lose' && !cfg.onLose) return;
        if (outcome === 'draw' && !cfg.onDraw) return;
        if (games % Math.max(1, cfg.everyN | 0) !== 0) return;
        slot = (outcome === 'draw') ? 'lose' : outcome;
      }
      clearTimeout(pending);
      pending = setTimeout(function () {
        show(slot, { game: data && data.game, outcome: outcome });
      }, cfg.delayMs || 1200);
    });
  }

  function onHub() {
    loadCfg().then(function () {
      if (!cfg.enabled) return;
      hubCount++;
      if (timeDue()) show('timeout', { from: 'hub' });
      else if (cfg.hubEveryN > 0 && hubCount % cfg.hubEveryN === 0) show('hub', { from: 'hub' });
    });
  }

  var _log = window.logEvent;
  if (typeof _log === 'function') {
    window.logEvent = function (type, data) {
      var r = _log.apply(this, arguments);
      try {
        if (type === 'game_start') onStart(data);
        else if (type === 'game_end') onEnd(data);
      } catch (e) {}
      return r;
    };
  }

  var _hub = window.goHub;
  if (typeof _hub === 'function') {
    window.goHub = function () {
      bank();
      var r = _hub.apply(this, arguments);
      try { onHub(); } catch (e) {}
      return r;
    };
  }

  window.addEventListener('load', function () { setTimeout(loadCfg, 1500); });
})();