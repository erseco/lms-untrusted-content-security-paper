// SPDX-License-Identifier: MIT
//
// Version-robustness harness for the PoC *demo* actions shipped in poc/probe.js
// (exePocOwnUser / exePocCreateCourse) and, by extension, evil-page* / evil-scorm.
// It logs in (admin lab account), injects probe.js into a real same-origin Moodle
// page, runs each demo action, and reports what actually happened so we can see
// which scraped mform fields / endpoints broke on a given Moodle version.
//
// Lab-only, authorised + reversible (own profile, a throwaway course/forum). It
// does perform real POSTs by design — that is the whole point of the demo block.
//
// Env: MOODLE_BASE (default http://localhost), EXE_USER (default user),
//      EXE_PASS (default 1234), OUT (json path).
// Run: node evidencias/demo-actions-test.cjs

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = (process.env.MOODLE_BASE || 'http://localhost').replace(/\/$/, '');
const USER = process.env.EXE_USER || 'user';
const PASS = process.env.EXE_PASS || '1234';
const PROBE = fs.readFileSync(path.join(__dirname, '..', 'poc', 'probe.js'), 'utf8');
const OUT = process.env.OUT || path.join(__dirname, 'resultados-demo-actions.json');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  const out = { base: BASE, user: USER };

  await page.goto('/login/index.php', { waitUntil: 'networkidle' });
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await Promise.all([page.waitForLoadState('domcontentloaded'), page.click('#loginbtn')]);
  out.loggedIn = !/login\/index\.php/.test(page.url());
  if (!out.loggedIn) { out.error = 'login failed'; fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n'); console.log('LOGIN FAILED'); await browser.close(); process.exit(3); }

  // A normal authenticated Moodle page carries M.cfg (sesskey/userId/wwwroot).
  await page.goto('/my/', { waitUntil: 'domcontentloaded' });
  out.release = await page.evaluate(() => (window.M && window.M.cfg && window.M.cfg.release) || null);
  out.hasMcfg = await page.evaluate(() => !!(window.M && window.M.cfg && window.M.cfg.sesskey));

  // Inject the probe (defines window.exePoc* on this same-origin page).
  await page.addScriptTag({ content: PROBE });
  out.demoFnsDefined = await page.evaluate(() => ({
    ownUser: typeof window.exePocOwnUser === 'function',
    createCourse: typeof window.exePocCreateCourse === 'function',
  }));

  // --- exePocOwnUser: rename + photo of the current user (own account) ---
  try {
    const r = await page.evaluate(() => new Promise((res) => {
      try { window.exePocOwnUser((s) => res(s)); } catch (e) { res('THREW:' + e.name); }
    }));
    let parsed; try { parsed = JSON.parse(r); } catch (e) { parsed = { raw: r }; }
    out.ownUser = parsed;
  } catch (e) { out.ownUser = { error: String(e).slice(0, 200) }; }

  // Verify the rename actually persisted (read it back from the profile API page).
  try {
    out.ownUserVerify = await page.evaluate(async () => {
      const uid = window.M.cfg.userId;
      const html = await (await fetch('/user/edit.php?id=' + uid, { credentials: 'same-origin' })).text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const fn = doc.querySelector('input[name=firstname]');
      return { firstnameValue: fn ? fn.value : null };
    });
  } catch (e) { out.ownUserVerify = { error: String(e).slice(0, 200) }; }

  // --- exePocCreateCourse: create a throwaway course + label + a few forum posts ---
  try {
    const r = await page.evaluate(() => new Promise((res) => {
      try { window.exePocCreateCourse((s) => res(s)); } catch (e) { res('THREW:' + e.name); }
    }));
    let parsed; try { parsed = JSON.parse(r); } catch (e) { parsed = { raw: r }; }
    out.createCourse = parsed;
  } catch (e) { out.createCourse = { error: String(e).slice(0, 200) }; }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({
    release: out.release, hasMcfg: out.hasMcfg,
    ownUser: out.ownUser, ownUserVerify: out.ownUserVerify, createCourse: out.createCourse,
  }, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
