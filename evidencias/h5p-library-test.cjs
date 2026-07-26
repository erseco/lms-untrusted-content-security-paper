/*
 * h5p-library-test.cjs — runtime collector for the passive full H5P probe in
 * Moodle. LOCAL disposable lab only. Run once for div and once for iframe.
 *
 * The package is selected with H5P_PACKAGE. The collector searches every frame for
 * the common __EXE_POC_RESULT contract and never overwrites curated evidence.
 *
 * Run: NODE_PATH=<wp-exelearning>/node_modules node h5p-library-test.cjs
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Env-overridable (defaults reproduce the original run); see firefox-moodle-test.cjs header.
const BASE = process.env.MOODLE_BASE || 'http://localhost';
const USER = process.env.MOODLE_USER || 'user';
const PASS = process.env.MOODLE_PASS || '1234';  // local disposable admin credential (env owner authorised)
const PKG = path.resolve(
  process.env.H5P_PACKAGE ||
  path.join(__dirname, '..', 'poc', 'h5p-probe-moodle-div.h5p')
);
const MODE = /iframe/i.test(path.basename(PKG)) ? 'iframe' : 'div';
const CTXID = 1;                     // system context content bank

const out = {
  browser: 'chromium',
  target: `Moodle Content Bank — full passive H5P probe (${MODE})`,
  date: new Date().toISOString().slice(0, 10),
  package: path.basename(PKG),
  mode: MODE,
  steps: {}
};
const consoleHits = [];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: false });
  const page = await ctx.newPage();
  page.on('console', m => { const t = m.text(); if (/EXE-POC/.test(t)) consoleHits.push(t.slice(0, 200)); });

  // --- login (e2e-style, local lab) ---
  await page.goto(`${BASE}/login/index.php`, { waitUntil: 'domcontentloaded' });
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await Promise.all([page.waitForLoadState('networkidle').catch(() => {}), page.click('#loginbtn')]);
  out.steps.loggedIn = await page.evaluate(() => !!(window.M && window.M.cfg && window.M.cfg.userId)).catch(() => false);

  // --- content bank index (Spanish UI: "Subir" opens the Moodle file picker) ---
  await page.goto(`${BASE}/contentbank/index.php?contextid=${CTXID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  out.steps.onIndexPage = /contentbank\/index/.test(page.url());

  // open the file picker via the "Subir" toolbar button
  try {
    const subir = page.locator('button:has-text("Subir"), a:has-text("Subir"), [data-action*="upload"]').first();
    await subir.click({ timeout: 8000 });
    // wait for the Moodle file picker modal
    await page.waitForSelector('.file-picker, input[type="file"]', { timeout: 10000 });
    await page.waitForTimeout(1000);
    // ensure the "Subir un archivo" repository pane is active, if a repo list shows
    const repo = page.locator('.fp-repo:has-text("Subir"), span:has-text("Subir un archivo")').first();
    if (await repo.count()) { await repo.click().catch(() => {}); await page.waitForTimeout(600); }
    // set the file on the repository upload input
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles(PKG, { timeout: 8000 });
    out.steps.fileSet = true;
    // confirm upload ("Subir este archivo")
    const upBtn = page.locator('.fp-upload-btn button, button:has-text("Subir este archivo"), button:has-text("Upload this file")').first();
    await Promise.all([page.waitForLoadState('networkidle').catch(() => {}), upBtn.click({ timeout: 8000 })]);
    out.steps.uploadClicked = true;
    await page.waitForTimeout(3000);
  } catch (e) { out.steps.pickerError = String(e).slice(0, 220); }

  out.steps.afterSaveUrl = page.url();
  // capture any Moodle validation/error notice
  out.steps.pageNotice = await page.evaluate(() => {
    const n = document.querySelector('.alert-danger, .errormessage, #notice, .box.errorbox');
    return n ? n.textContent.trim().slice(0, 300) : null;
  }).catch(() => null);

  // --- if we landed on a content view, read the PoC signal (top + every frame) ---
  async function readSignal() {
    const frames = page.frames();
    for (const f of frames) {
      const r = await f.evaluate(() => {
        const sig = window.__EXE_POC_RESULT || null;
        const host = window.__EXE_POC_HOST || null;
        const panel = !!document.querySelector('#exe-poc-result');
        const origin = window.origin;
        return {
          sig,
          host,
          panel,
          origin,
          frameUrl: location.href.slice(0, 180),
          frameIsTop: window.parent === window
        };
      }).catch(() => null);
      if (r && r.sig) return r;
    }
    return null;
  }
  await page.waitForTimeout(1500);
  out.steps.signal = await readSignal();
  out.steps.consoleHits = consoleHits;

  // verdict
  const s = out.steps.signal;
  out.verdict = {
    full_probe_executed: !!(s && s.sig),
    non_opaque_origin: !!(s && s.sig && !s.sig.isOpaqueOrigin),
    can_read_parent_dom: !!(s && s.sig && s.sig.canReadParentDocument),
    can_find_sesskey_boolean: !!(s && s.sig && s.sig.canFindSesskey),
    sandbox_attr: s && s.sig ? s.sig.sandboxAttr : null,
    frame_url: s ? s.frameUrl : null,
    frame_is_top: s ? s.frameIsTop : null
  };

  await browser.close();
  // NOTE: write to a *distinct* live-output filename. The committed
  // resultados-h5p-library.json is HAND-AUTHORED, curated evidence and must NOT be
  // overwritten by a script run (re-running this would otherwise clobber it).
  fs.writeFileSync(
    path.join(__dirname, `resultados-h5p-moodle-${MODE}-live.json`),
    JSON.stringify(out, null, 2)
  );
  console.log(JSON.stringify(out, null, 2));
})().catch(e => {
  console.error('FATAL', e);
  try {
    fs.writeFileSync(
      path.join(__dirname, `resultados-h5p-moodle-${MODE}-live.json`),
      JSON.stringify({ ...out, fatal: String(e).slice(0, 300), consoleHits }, null, 2)
    );
  } catch (_) {}
  process.exit(1);
});
