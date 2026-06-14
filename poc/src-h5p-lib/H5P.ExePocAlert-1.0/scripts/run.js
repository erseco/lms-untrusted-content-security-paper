/*
 * run.js — preloadedJs of the H5P.ExePocAlert content type.
 *
 * SAFE proof-of-concept. H5P libraries are TRUSTED CODE: their preloadedJs runs as a
 * real <script> in the host page, same-origin and unsandboxed. This file PROVES that by
 * (a) showing a visible, reversible notice and (b) recording read-only capability
 * booleans. It NEVER reads or transmits secret values (sesskey content, cookies), makes
 * no network request, and mutates nothing. Installing a new library needs the
 * moodle/h5p:updatelibraries capability (manager/admin by default), so this demonstrates
 * an admin-trust / supply-chain risk, not a teacher-level escalation.
 */
var H5P = H5P || {};

H5P.ExePocAlert = (function () {
  function ExePocAlert(params, contentId) {
    this.params = params;
    this.contentId = contentId;
  }

  ExePocAlert.prototype.attach = function ($container) {
    var checks = {
      libraryJsRan: true,        // reaching this line already proves library JS executed
      sameOrigin: false,
      canReadParentDom: false,
      canFindSesskey: false      // boolean ONLY — the value is never read or shown
    };

    // Read-only capability probe against the host window (no values, no mutation).
    try {
      var W = window.parent || window;
      checks.sameOrigin = (window.origin !== 'null');
      void W.document;                       // throws (SecurityError) if cross-origin/opaque
      checks.canReadParentDom = !!W.document;
      checks.canFindSesskey = !!(W.M && W.M.cfg && W.M.cfg.sesskey);
    } catch (e) { /* opaque origin: stays false */ }

    if (typeof window !== 'undefined') {
      window.__EXE_POC_H5P_LIB = checks;
    }
    if (window.console && console.log) {
      console.log('[EXE-POC] H5P library preloadedJs executed same-origin:', checks);
    }

    // Visible, reversible notice (non-blocking; no alert() that would freeze the page).
    try {
      var root = ($container && $container[0]) ? $container[0] : document.body;
      var el = document.createElement('div');
      el.setAttribute('data-exe-poc', '1');
      el.setAttribute(
        'style',
        'padding:12px 14px;margin:8px 0;border:2px solid #c00;border-radius:8px;' +
        'background:#fff0f0;color:#900;font:14px/1.5 system-ui,Arial,sans-serif'
      );
      el.innerHTML =
        '<strong>[EXE-POC] El JavaScript de una <em>librería</em> H5P se ha ejecutado.</strong><br>' +
        'Corre en el <strong>mismo origen</strong> que el LMS (sin sandbox). ' +
        'Mismo origen detectado: <code>' + checks.sameOrigin + '</code> · ' +
        'lee el DOM del LMS: <code>' + checks.canReadParentDom + '</code> · ' +
        'localiza un <code>sesskey</code> (solo presencia, sin leer el valor): <code>' +
        checks.canFindSesskey + '</code>.';
      root.appendChild(el);
    } catch (e) { /* ignore render errors */ }
  };

  return ExePocAlert;
})();
