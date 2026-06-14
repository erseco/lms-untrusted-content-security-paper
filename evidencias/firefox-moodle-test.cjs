/*
 * firefox-moodle-test.cjs — Firefox/Gecko isolation check of the mod_exelearning
 * secure-mode activity iframe, via Playwright. LOCAL disposable test environment only.
 *
 * Logs into the local Moodle (throwaway dev credentials) the way an e2e suite does,
 * opens a mod_exelearning activity (secure mode) and checks, from the parent page,
 * that the content iframe is opaque (contentDocument === null, contentWindow access
 * throws SecurityError). No destructive action is taken.
 *
 * Run: NODE_PATH=<wp-exelearning>/node_modules node firefox-moodle-test.cjs
 */
const { firefox } = require('playwright');
const fs = require('fs');

const BASE = 'http://localhost';
const USER = 'user';
const PASS = '1234';           // local disposable dev credential, provided by the env owner
const CMIDS = [2, 6];          // mod_exelearning activities to check

(async () => {
  const browser = await firefox.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const out = { browser: 'firefox', target: 'mod_exelearning (Moodle, iframemode=secure)', date: '2026-06-14', activities: {} };
  out.userAgent = await page.goto(BASE + '/login/index.php', { waitUntil: 'domcontentloaded' }).then(() => page.evaluate(() => navigator.userAgent));

  // --- login (e2e-style; local dev env) ---
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await Promise.all([ page.waitForLoadState('networkidle').catch(() => {}), page.click('#loginbtn') ]);
  out.loggedIn = await page.evaluate(() => !!(window.M && window.M.cfg && window.M.cfg.userId)).catch(() => false);
  out.userId = await page.evaluate(() => (window.M && window.M.cfg) ? window.M.cfg.userId : null).catch(() => null);

  // --- per-activity opaque check ---
  for (const cmid of CMIDS) {
    try {
      await page.goto(`${BASE}/mod/exelearning/view.php?id=${cmid}`, { waitUntil: 'load', timeout: 25000 });
      await page.waitForTimeout(2000);
      out.activities[cmid] = await page.evaluate(() => {
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
    } catch (e) { out.activities[cmid] = { error: String(e).slice(0, 140) }; }
  }
  out.verdict_all_opaque = Object.values(out.activities).every(a => a && a.opaque === true);

  await browser.close();
  fs.writeFileSync(__dirname + '/resultados-firefox-moodle.json', JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FATAL', e); process.exit(1); });
