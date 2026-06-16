/*
 * webkit-isolation-test.cjs — WebKit/Safari replication of the same-origin vs
 * opaque-origin isolation checks, via Playwright. Closes the "Safari/WebKit not
 * tested" gap so the cross-engine isolation evidence spans Chromium, Firefox/Gecko
 * AND WebKit. LOCAL disposable test environment only; read-only parent-side checks.
 *
 * It runs whatever is reachable, so one invocation covers as many surfaces as are up:
 *   Test A (self-contained): two srcdoc iframes on a real http origin, one sandboxed
 *     WITH allow-same-origin (legacy) and one WITHOUT (secure/opaque). Each inner doc
 *     reports, FROM INSIDE, whether it can reach window.parent. Engine-portable; needs
 *     only any local http origin (prefers MOODLE_BASE, falls back to WP_BASE).
 *   Test M (mod_exelearning, Moodle secure mode): logs in and, from the parent page,
 *     checks each activity iframe is opaque (contentDocument === null, contentWindow
 *     access throws SecurityError). Skipped if Moodle is down.
 *   Test B/C (wp-exelearning :8890 / omeka-s :8080 secure embeds): parent-side opaque
 *     check on the real plugin embed. Each skipped if its host is down.
 *
 * Run: NODE_PATH=<wp-exelearning>/node_modules node webkit-isolation-test.cjs
 * Env (all optional; mirror the firefox-* harnesses):
 *   MOODLE_BASE (default http://localhost), MOODLE_USER (user), MOODLE_PASS (1234),
 *   MOODLE_CMIDS (2,6), WP_BASE (http://localhost:8890), WP_EMBED_PATH (/?p=15),
 *   OMEKA_BASE (http://localhost:8080), OMEKA_EMBED_PATH (/s/exelearning-demo/item/5).
 */
const { webkit } = require('playwright');
const fs = require('fs');

const MOODLE_BASE = process.env.MOODLE_BASE || 'http://localhost';
const MOODLE_USER = process.env.MOODLE_USER || 'user';
const MOODLE_PASS = process.env.MOODLE_PASS || '1234'; // local disposable dev credential
const CMIDS = (process.env.MOODLE_CMIDS || '2,6').split(',').map(s => Number(s.trim())).filter(Number.isFinite);
const WP_BASE = process.env.WP_BASE || 'http://localhost:8890';
const OMEKA_BASE = process.env.OMEKA_BASE || 'http://localhost:8080';
const WP_EMBED_PATH = process.env.WP_EMBED_PATH || '/?p=15';
const OMEKA_EMBED_PATH = process.env.OMEKA_EMBED_PATH || '/s/exelearning-demo/item/5';

const PROBE = (mode) => `<!doctype html><meta charset="utf-8"><script>
(function(){
  var r = { mode: ${JSON.stringify(mode)} };
  try { void window.parent.document; r.canAccessParentDocument = true; }
  catch (e) { r.canAccessParentDocument = false; r.parentDocError = e.name; }
  try { void window.parent.location.href; r.canReadParentLocation = true; }
  catch (e) { r.canReadParentLocation = false; r.parentLocError = e.name; }
  try { r.isOpaqueOrigin = (window.origin === 'null'); } catch (e) { r.isOpaqueOrigin = true; }
  try { window.parent.postMessage(r, '*'); } catch (e) {}
})();
<\/script>`;

async function up(url) {
  try {
    const c = require('child_process').execSync(
      `curl -s -o /dev/null -w '%{http_code}' --max-time 4 ${JSON.stringify(url)}`, { encoding: 'utf8' });
    return c === '200' || c === '303' || c === '302';
  } catch (e) { return false; }
}

async function probeEmbed(page, url) {
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 25000 });
    await page.waitForTimeout(1800);
    return await page.evaluate(() => {
      const ifr = [...document.querySelectorAll('iframe')];
      const f = ifr.find(x => /exelearning/i.test(x.getAttribute('src') || x.getAttribute('data-src') || ''));
      if (!f) return { error: 'no exelearning iframe found', iframeCount: ifr.length };
      const r = { src: (f.getAttribute('src') || f.getAttribute('data-src') || '').slice(0, 95), sandbox: f.getAttribute('sandbox') };
      try { r.parentCanReadChildDoc = (f.contentDocument !== null); }
      catch (e) { r.parentCanReadChildDoc = 'THREW'; r.contentDocError = e.name; }
      try { void f.contentWindow.location.href; r.contentWindowReadable = true; }
      catch (e) { r.contentWindowReadable = false; r.contentWindowError = e.name; }
      r.opaque = (r.contentWindowReadable === false);
      return r;
    });
  } catch (e) { return { error: String(e).slice(0, 140) }; }
}

(async () => {
  const moodleUp = await up(MOODLE_BASE + '/login/index.php');
  const wpUp = await up(WP_BASE + '/');
  const omekaUp = await up(OMEKA_BASE + '/');
  const originHost = moodleUp ? MOODLE_BASE : (wpUp ? WP_BASE : OMEKA_BASE);

  const browser = await webkit.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const out = {
    _meta: {
      descripcion: 'Replica en WebKit/Safari (vía Playwright) de las comprobaciones de aislamiento same-origin vs origen opaco, para cerrar el hueco "Safari/WebKit no probado". Test A autocontenido (srcdoc + sandbox con/sin allow-same-origin) + embed real de mod_exelearning en modo secure (Moodle 5.2.1) + wp/omeka si están arriba. Comprobaciones de solo lectura desde la página padre; lab local desechable.',
      harness: 'evidencias/webkit-isolation-test.cjs',
      engine: 'webkit (Playwright)',
      moodle: 'erseco/alpine-moodle:v5.2.1 (Moodle 5.2.1)',
      prototypes: { mod_exelearning: '73fe6ff' },
    },
    browser: 'webkit',
    target: 'opaque-origin isolation across surfaces (self-contained + real plugin embeds)',
    hostsUp: { moodle: moodleUp, wp: wpUp, omeka: omekaUp, originHost },
    tests: {},
  };

  // --- Test A: self-contained sandbox behavior on a real http origin ---
  await page.goto(originHost + '/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  out.userAgent = await page.evaluate(() => navigator.userAgent);
  out.tests.sandboxBehavior = await page.evaluate(async ({ legacySrc, secureSrc }) => {
    return await new Promise((resolve) => {
      const got = {};
      window.addEventListener('message', (e) => {
        const d = e.data;
        if (d && d.mode) { got[d.mode] = d; if (Object.keys(got).length >= 2) resolve(got); }
      });
      const mk = (html, sandbox) => {
        const f = document.createElement('iframe');
        f.setAttribute('sandbox', sandbox);
        f.style.cssText = 'width:50px;height:50px;position:fixed;left:-9999px;top:0';
        f.setAttribute('srcdoc', html);
        document.body.appendChild(f);
      };
      mk(legacySrc, 'allow-scripts allow-same-origin');
      mk(secureSrc, 'allow-scripts');
      setTimeout(() => resolve(got), 6000);
    });
  }, { legacySrc: PROBE('legacy(allow-same-origin)'), secureSrc: PROBE('secure(no-same-origin)') });

  // --- Test M: mod_exelearning secure-mode activities (Moodle) ---
  if (moodleUp) {
    out.tests.mod_exelearning = { activities: {} };
    try {
      await page.goto(MOODLE_BASE + '/login/index.php', { waitUntil: 'domcontentloaded' });
      await page.fill('#username', MOODLE_USER);
      await page.fill('#password', MOODLE_PASS);
      await Promise.all([page.waitForLoadState('networkidle').catch(() => {}), page.click('#loginbtn')]);
      out.tests.mod_exelearning.loggedIn = await page.evaluate(() => !!(window.M && window.M.cfg && window.M.cfg.userId)).catch(() => false);
      for (const cmid of CMIDS) {
        try {
          await page.goto(`${MOODLE_BASE}/mod/exelearning/view.php?id=${cmid}`, { waitUntil: 'load', timeout: 25000 });
          await page.waitForTimeout(2000);
          out.tests.mod_exelearning.activities[cmid] = await page.evaluate(() => {
            const ifr = [...document.querySelectorAll('iframe')];
            const f = ifr.find(x => /exelearning|tokenpluginfile/i.test(x.getAttribute('src') || ''))
                   || document.getElementById('exelearningobject');
            if (!f) return { error: 'no exelearning iframe', iframeCount: ifr.length };
            const r = { id: f.id || null, src: (f.getAttribute('src') || '').slice(0, 95), sandbox: f.getAttribute('sandbox') };
            try { r.parentCanReadChildDoc = (f.contentDocument !== null); }
            catch (e) { r.parentCanReadChildDoc = 'THREW'; r.contentDocError = e.name; }
            try { void f.contentWindow.location.href; r.contentWindowReadable = true; }
            catch (e) { r.contentWindowReadable = false; r.contentWindowError = e.name; }
            r.opaque = (r.contentWindowReadable === false);
            return r;
          });
        } catch (e) { out.tests.mod_exelearning.activities[cmid] = { error: String(e).slice(0, 140) }; }
      }
    } catch (e) { out.tests.mod_exelearning.error = String(e).slice(0, 140); }
  }

  // --- Test B/C: real wp-exelearning / omeka-s-exelearning secure embeds ---
  if (wpUp) out.tests.wp_exelearning = await probeEmbed(page, WP_BASE + WP_EMBED_PATH);
  if (omekaUp) out.tests.omeka_s_exelearning = await probeEmbed(page, OMEKA_BASE + OMEKA_EMBED_PATH);

  // --- Verdict ---
  const sb = out.tests.sandboxBehavior || {};
  const leg = sb['legacy(allow-same-origin)'] || {};
  const sec = sb['secure(no-same-origin)'] || {};
  const acts = out.tests.mod_exelearning ? Object.values(out.tests.mod_exelearning.activities || {}) : [];
  out.verdict = {
    legacy_can_reach_parent: leg.canAccessParentDocument === true,
    secure_blocked_from_parent: sec.canAccessParentDocument === false && sec.isOpaqueOrigin === true,
    mod_exelearning_all_opaque: acts.length > 0 ? acts.every(a => a && a.opaque === true) : null,
    wp_opaque: out.tests.wp_exelearning ? out.tests.wp_exelearning.contentWindowReadable === false : null,
    omeka_opaque: out.tests.omeka_s_exelearning ? out.tests.omeka_s_exelearning.contentWindowReadable === false : null,
  };

  await browser.close();
  fs.writeFileSync(__dirname + '/resultados-webkit.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
