/*
 * firefox-isolation-test.cjs — Cross-browser (Firefox/Gecko) replication of the
 * same-origin vs opaque-origin isolation checks, via Playwright.
 *
 * Run:  NODE_PATH=<wp-exelearning>/node_modules node firefox-isolation-test.cjs
 *
 * Test A (self-contained): two iframes on a real http origin, one sandboxed WITH
 *   allow-same-origin (legacy) and one WITHOUT (secure/opaque). Each inner doc tries
 *   to read window.parent and reports the result back by postMessage — i.e. it
 *   measures, FROM INSIDE, whether author content can reach the parent.
 * Test B/C (real plugins): the live secure-mode embeds of wp-exelearning (:8890) and
 *   omeka-s-exelearning (:8080). Parent-side check: an opaque iframe yields
 *   contentDocument === null and contentWindow access throwing (SecurityError).
 *
 * Output: resultados-firefox.json + console.
 */
const { firefox } = require('playwright');
const fs = require('fs');

// Host base URLs are env-overridable (defaults reproduce the original paper run);
// see the env-var block in firefox-moodle-test.cjs.
//   WP_BASE        wp-exelearning base URL   (default: http://localhost:8890)
//   OMEKA_BASE     omeka-s base URL          (default: http://localhost:8080)
//   WP_EMBED_PATH  WP embed page path        (default: /?p=15)
//   OMEKA_EMBED_PATH omeka public item path  (default: /s/exelearning-demo/item/5)
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
      return r;
    });
  } catch (e) { return { error: String(e).slice(0, 140) }; }
}

(async () => {
  const browser = await firefox.launch();
  const page = await browser.newPage();
  const out = { browser: 'firefox', date: '2026-06-14', tests: {} };

  // --- Test A: self-contained sandbox behavior on a real http origin ---
  await page.goto(WP_BASE + '/', { waitUntil: 'domcontentloaded', timeout: 20000 });
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

  // --- Test B: real wp-exelearning secure embed ---
  out.tests.wp_exelearning = await probeEmbed(page, WP_BASE + WP_EMBED_PATH);
  // --- Test C: real omeka-s-exelearning secure embed ---
  out.tests.omeka_s_exelearning = await probeEmbed(page, OMEKA_BASE + OMEKA_EMBED_PATH);

  // --- Verdict ---
  const sb = out.tests.sandboxBehavior || {};
  const leg = sb['legacy(allow-same-origin)'] || {};
  const sec = sb['secure(no-same-origin)'] || {};
  out.verdict = {
    legacy_can_reach_parent: leg.canAccessParentDocument === true,
    secure_blocked_from_parent: sec.canAccessParentDocument === false && sec.isOpaqueOrigin === true,
    wp_opaque: out.tests.wp_exelearning && out.tests.wp_exelearning.contentWindowReadable === false,
    omeka_opaque: out.tests.omeka_s_exelearning && out.tests.omeka_s_exelearning.contentWindowReadable === false,
  };

  await browser.close();
  fs.writeFileSync(__dirname + '/resultados-firefox.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
