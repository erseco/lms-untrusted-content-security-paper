// SPDX-License-Identifier: MIT
//
// Version-robustness check for poc/evil-page-auto.html — the "auto" demo that, for a
// NON-admin account, flips the page and changes the user's OWN name + profile photo on
// load (admins get a guardrail instead). We log in as a non-admin (the seeded
// teacher_demo), inject the page's inline <script> into a real same-origin Moodle page,
// let it run, and read back firstname/picture to confirm both changed.
//
// Env: MOODLE_BASE (default http://localhost), AUTO_USER (default teacher_demo),
//      AUTO_PASS (default Demo!2026), OUT (json path).
// Run: node evidencias/auto-page-test.cjs

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = (process.env.MOODLE_BASE || 'http://localhost').replace(/\/$/, '');
const USER = process.env.AUTO_USER || 'teacher_demo';
const PASS = process.env.AUTO_PASS || 'Demo!2026';
const OUT = process.env.OUT || path.join(__dirname, 'resultados-auto-page.json');

// Extract the inline <script> body from evil-page-auto.html (the auto demo).
const HTML = fs.readFileSync(path.join(__dirname, '..', 'poc', 'evil-page-auto.html'), 'utf8');
const SCRIPT = (HTML.match(/<script>([\s\S]*?)<\/script>/) || [, ''])[1];

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  const out = { base: BASE, user: USER, scriptBytes: SCRIPT.length };

  await page.goto('/login/index.php', { waitUntil: 'networkidle' });
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await Promise.all([page.waitForLoadState('domcontentloaded'), page.click('#loginbtn')]);
  out.loggedIn = !/login\/index\.php/.test(page.url());
  if (!out.loggedIn) { out.error = 'login failed for ' + USER; fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n'); console.log('LOGIN FAILED for', USER); await browser.close(); process.exit(3); }

  await page.goto('/my/', { waitUntil: 'domcontentloaded' });
  const before = await page.evaluate(async () => {
    const uid = window.M.cfg.userId;
    const html = await (await fetch('/user/edit.php?id=' + uid, { credentials: 'same-origin' })).text();
    const fn = new DOMParser().parseFromString(html, 'text/html').querySelector('input[name=firstname]');
    return { uid, firstname: fn ? fn.value : null };
  });
  out.before = before;
  out.isHighPrivilege = await page.evaluate(() => {
    return [].slice.call(document.querySelectorAll('a[href]')).some((a) => /\/admin\/(search|index|user)\.php/.test(a.getAttribute('href') || ''));
  });

  // Inject and run the auto demo exactly as it would run inside a mod_page resource.
  await page.addScriptTag({ content: SCRIPT });
  // The demo's profile change is fire-and-forget (no callback); give it time to POST
  // (decoupled name + photo = several sequential requests).
  await page.waitForTimeout(10000);

  out.after = await page.evaluate(async () => {
    const uid = window.M.cfg.userId;
    const html = await (await fetch('/user/edit.php?id=' + uid, { credentials: 'same-origin' })).text();
    const fn = new DOMParser().parseFromString(html, 'text/html').querySelector('input[name=firstname]');
    return { firstname: fn ? fn.value : null };
  });
  // Did the page flip (cosmetic) and a guardrail/modal appear?
  out.flipped = await page.evaluate(() => /scaleX\(-1\)/.test(document.body.style.transform || ''));
  out.guardrailShown = await page.evaluate(() => !!document.querySelector('[data-exe-demo]'));

  out.nameChanged = out.after.firstname === 'PWNED ;)';
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({
    user: USER, isHighPrivilege: out.isHighPrivilege, flipped: out.flipped, guardrailShown: out.guardrailShown,
    before: out.before.firstname, after: out.after.firstname, nameChanged: out.nameChanged,
  }, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
