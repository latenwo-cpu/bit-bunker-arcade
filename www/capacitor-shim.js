/* PIXEL ARCADE - makes native Capacitor plugins reachable from plain-HTML pages.
   Without this, window.Capacitor.Plugins.AdMob is undefined inside the app
   (Capacitor only fills Capacitor.Plugins when a bundler calls registerPlugin),
   so no AdMob banner or interstitial could ever show.
   Load it FIRST in <head>. In a normal browser it does nothing. */
(function () {
  'use strict';
  var cap = window.Capacitor;
  if (!cap || typeof cap.nativePromise !== 'function' ||
      typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) return;

  cap.Plugins = cap.Plugins || {};
  ['AdMob'].forEach(function (name) {
    if (cap.Plugins[name]) return;
    cap.Plugins[name] = new Proxy({}, {
      get: function (t, method) {
        if (typeof method === 'symbol' || method === 'then' || method === 'toJSON') return undefined;
        if (method === 'addListener') {
          return function (eventName, handler) {
            var h = cap.addListener(name, eventName, handler);
            return Promise.resolve(h);
          };
        }
        if (method === 'removeAllListeners') return function () { return Promise.resolve(); };
        return function (opts) { return cap.nativePromise(name, String(method), opts || {}); };
      }
    });
  });
})();
