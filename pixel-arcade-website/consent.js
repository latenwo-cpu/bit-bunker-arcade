/* =========================================================================
   PIXEL ARCADE — Ad consent (Google-certified CMP, EEA / UK / Switzerland)
   -------------------------------------------------------------------------
   Google requires a certified consent tool before personalised ads are
   served to users in the EEA, UK and Switzerland. This file wires up
   Google's own tools; it never shows a home-made banner.

   ANDROID APP  -> Google UMP SDK, through the AdMob plugin:
                   requestConsentInfo -> showConsentForm (if required)
                   -> initialize AdMob only when canRequestAds is true.
                   Nothing in the app may call AdMob.initialize() directly;
                   use  PaConsent.ensure()  (resolves true when ads may load).
   WEBSITE      -> Google's "Privacy & messaging" (Funding Choices) message is
                   delivered by the AdSense tag already on every page. It only
                   appears once a GDPR message is PUBLISHED in the AdSense
                   dashboard (Privacy & messaging). This file adds the
                   "Privacy and cookie settings" revocation link Google
                   requires, and shows it only where GDPR applies.

   Any element with  data-pa-privacy-choices  is the "Privacy & ad choices"
   link: it stays hidden until the consent tool says it is needed.

   Load it early in <head>, right after capacitor-shim.js:
       <script src="/consent.js"></script>
   Pages that only need the link (privacy, about...) add  data-links-only
   so the app doesn't run the full consent/ads flow there:
       <script src="/consent.js" data-links-only></script>

   Testing the app's EU form on a test device (remote-debug the WebView and
   run in the console, then relaunch the app):
       localStorage.pa_consent_debug_geo = 'EEA'
       localStorage.pa_consent_test_ids  = '<your-test-device-id-from-logcat>'
   Remove both keys when finished.
   ========================================================================= */
(function () {
  'use strict';

  var cap = window.Capacitor;
  var native = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  var linksOnly = !!(document.currentScript && document.currentScript.hasAttribute('data-links-only'));
  var LINK_SEL = '[data-pa-privacy-choices]';

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function showLinks(show) {
    var run = function () {
      var els = document.querySelectorAll(LINK_SEL);
      for (var i = 0; i < els.length; i++) els[i].style.display = show ? '' : 'none';
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
  }

  /* ---------------------------------------------------------------- app */
  var AdMob = native && cap.Plugins && cap.Plugins.AdMob;
  var pending = null;        // in-flight or finished consent run
  var retryAt = 0;           // after a technical failure, don't retry before this time
  var state = { canRequestAds: false, privacyOptionsRequired: false, initialized: false };

  function consentOptions() {
    var opts = {};
    var geo = lsGet('pa_consent_debug_geo');
    // AdmobConsentDebugGeography: DISABLED 0, EEA 1, NOT_EEA 2, US 3, OTHER 4
    var map = { EEA: 1, NOT_EEA: 2, US: 3, OTHER: 4 };
    if (geo && map[geo]) opts.debugGeography = map[geo];
    var ids = lsGet('pa_consent_test_ids');
    if (ids) opts.testDeviceIdentifiers = ids.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    return opts;
  }

  function readInfo(info) {
    state.canRequestAds = !!(info && info.canRequestAds);
    state.privacyOptionsRequired = !!(info && info.privacyOptionsRequirementStatus === 'REQUIRED');
    showLinks(state.privacyOptionsRequired);
  }

  function runConsent() {
    return AdMob.requestConsentInfo(consentOptions()).then(function (info) {
      if (info && info.isConsentFormAvailable && info.status === 'REQUIRED') return AdMob.showConsentForm();
      return info;
    }).then(function (info) {
      readInfo(info);
      if (!state.canRequestAds) return false;
      if (state.initialized) return true;
      return AdMob.initialize({}).then(function () { state.initialized = true; return true; });
    });
  }

  /* Resolves true when ads may be requested, false when they may not.
     Safe to call from many places: the consent flow runs once. */
  function ensure() {
    if (!native || !AdMob) return Promise.resolve(false);
    if (pending) return pending;
    if (Date.now() < retryAt) return Promise.resolve(false);
    pending = runConsent().catch(function (e) {
      console.warn('Ad consent flow failed', e);
      pending = null;                    // technical failure (e.g. offline): allow a retry...
      retryAt = Date.now() + 15000;      // ...but not in a tight loop
      return false;
    });
    return pending;
  }

  /* Only learn whether the "Privacy & ad choices" link is needed. */
  function checkOptionsOnly() {
    if (!native || !AdMob) return;
    AdMob.requestConsentInfo(consentOptions()).then(readInfo).catch(function () {});
  }

  /* ---------------------------------------------------------------- web */
  function setupWeb() {
    // Namespace/queue must exist before Google's script loads (we are earlier in <head>).
    window.googlefc = window.googlefc || {};
    window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
    window.googlefc.callbackQueue.push({
      CONSENT_API_READY: function () {
        if (typeof window.__tcfapi !== 'function') return;
        // 0 = latest TCF version. Show the link only where GDPR applies.
        window.__tcfapi('addEventListener', 0, function (tcdata, success) {
          showLinks(!!(success && tcdata && tcdata.gdprApplies));
        });
      }
    });
  }

  /* ------------------------------------------------------- public API */
  function openPrivacyOptions() {
    if (native) {
      if (!AdMob) return Promise.resolve();
      return AdMob.showPrivacyOptionsForm().then(function () {
        pending = null; retryAt = 0;     // the choice may have changed: re-evaluate
        return linksOnly ? undefined : ensure();
      }).catch(function (e) { console.warn('Privacy options form failed', e); });
    }
    var fc = window.googlefc;
    if (fc && typeof fc.showRevocationMessage === 'function') fc.showRevocationMessage();
    return Promise.resolve();
  }

  window.PaConsent = {
    ensure: ensure,
    openPrivacyOptions: openPrivacyOptions,
    state: state
  };

  // Hide the link until we know it is needed (it is also hidden in markup).
  showLinks(false);

  // Delegate clicks so pages don't need inline handlers.
  document.addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest(LINK_SEL) : null;
    if (!t) return;
    ev.preventDefault();
    openPrivacyOptions();
  });

  if (native) {
    if (linksOnly) checkOptionsOnly();
    else ensure();                      // run at launch, before any ad is requested
  } else {
    setupWeb();
  }
})();
