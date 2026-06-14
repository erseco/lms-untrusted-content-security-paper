// SPDX-License-Identifier: MIT
//
// Live isolation probe for mod_exelearning (secure vs legacy) measured FROM INSIDE the
// package iframe, plus the role-bounded same-origin foothold (W2) and the response-level
// CSP `sandbox` header (R3). Read-only: it never POSTs, never forges, and reports the
// sesskey only as a length (value REDACTED).
//
// Env: MOODLE_BASE (default http://localhost), EXE_USER, EXE_PASS, EXPECT_MODE
//      (secure|legacy, informational), OUT (json path). The caller toggles
//      mod_exelearning/iframemode via admin/cli/cfg.php between runs.
//
// Run:  NODE_PATH=/path/to/mod_exelearning_3/node_modules \
//       EXE_USER=user EXE_PASS=1234 EXPECT_MODE=secure OUT=evidencias/out.json \
//       node evidencias/exe-live-isolation-test.cjs

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = (process.env.MOODLE_BASE || 'http://localhost').replace(/\/$/, '');
const USER = process.env.EXE_USER || 'user';
const PASS = process.env.EXE_PASS || '1234';
const EXPECT_MODE = process.env.EXPECT_MODE || 'unknown';
const OUT = process.env.OUT || path.join(__dirname, `resultados-live-${USER}-${EXPECT_MODE}.json`);

// Measured INSIDE the package iframe (the package's own JS context). REDACTS the sesskey.
function probeInside() {
  const r = {};
  try { r.origin = window.origin; } catch (e) { r.origin = 'ERR:' + e.name; }
  try { r.isOpaqueOrigin = (window.origin === 'null'); } catch (e) { r.isOpaqueOrigin = 'ERR:' + e.name; }
  try { r.locationHref = location.href; } catch (e) { r.locationHref = 'ERR:' + e.name; }
  try { void window.parent.document.cookie; r.canReadParentDocument = true; } catch (e) { r.canReadParentDocument = 'BLOCKED:' + e.name; }
  try {
    const sk = window.parent.M && window.parent.M.cfg && window.parent.M.cfg.sesskey;
    r.sesskeyRead = sk ? ('READ(len=' + String(sk).length + ', value=REDACTED)') : 'NONE';
  } catch (e) { r.sesskeyRead = 'BLOCKED:' + e.name; }
  try { r.canFindForms = window.parent.document.querySelectorAll('form').length; } catch (e) { r.canFindForms = 'BLOCKED:' + e.name; }
  try {
    const links = Array.prototype.slice.call(window.parent.document.querySelectorAll('a[href]'));
    r.adminLinks = links.filter((a) => /\/admin\//.test(a.getAttribute('href') || '')).length;
    r.editLinks = links.filter((a) => /edit(settings)?\.php|action=edit/.test(a.getAttribute('href') || '')).length;
  } catch (e) { r.adminLinks = 'BLOCKED:' + e.name; r.editLinks = 'BLOCKED:' + e.name; }
  return r;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  const out = { base: BASE, user: USER, expect_mode: EXPECT_MODE, steps: {} };

  // --- login (networkidle on the GET so the MoodleSession cookie + logintoken match,
  //     which matters behind a CDN such as Cloudflare) ---
  await page.goto('/login/index.php', { waitUntil: 'networkidle' });
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await Promise.all([
    page.waitForLoadState('domcontentloaded'),
    page.click('#loginbtn'),
  ]);
  out.loggedIn = !/login\/index\.php/.test(page.url()) && !(await page.locator('#loginerrormessage').count());
  if (!out.loggedIn) {
    out.error = 'login failed for ' + USER;
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
    console.log('LOGIN FAILED for', USER); await browser.close(); process.exit(3);
  }

  // --- find an exelearning activity (course 2 locally; dashboard/home as fallback; ACTIVITY_URL to override) ---
  async function findExe(urls) {
    for (const u of urls) {
      try { await page.goto(u, { waitUntil: 'domcontentloaded' }); } catch (e) { continue; }
      const h = await page.evaluate(() => {
        const a = Array.prototype.slice.call(document.querySelectorAll('a[href]'))
          .find((x) => /\/mod\/exelearning\/view\.php/.test(x.getAttribute('href') || ''));
        return a ? a.href : null;
      });
      if (h) return h;
    }
    return null;
  }
  let href = process.env.ACTIVITY_URL || await findExe(['/course/view.php?id=2', '/my/', '/']);
  out.activityUrl = href;
  if (!href) { out.error = 'exelearning activity not found/visible for ' + USER; fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n'); console.log('NO ACTIVITY for', USER); await browser.close(); process.exit(4); }

  await page.goto(href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#exelearningobject', { timeout: 15000 });

  // Parent-side facts.
  out.sandboxAttr = await page.getAttribute('#exelearningobject', 'sandbox');
  const iframeSrc = await page.getAttribute('#exelearningobject', 'src');
  out.iframeSrc = iframeSrc ? iframeSrc.replace(/\/tokenpluginfile\.php\/[^/]+\//, '/tokenpluginfile.php/REDACTED_TOKEN/') : null;
  out.secureBridgePresent = await page.evaluate(() => /scorm_bridge_relay|exeScormBridge/.test(document.documentElement.innerHTML));

  // Wait for the package frame to load, then probe from inside.
  await page.waitForTimeout(1500);
  const el = await page.$('#exelearningobject');
  const frame = await el.contentFrame();
  try {
    out.insideIframe = await frame.evaluate(probeInside);
  } catch (e) {
    out.insideIframe = { error: 'frame.evaluate failed: ' + String(e).slice(0, 200) };
  }

  // R3: response-level CSP `sandbox` header on the package HTML document (secure mode only).
  if (iframeSrc) {
    try {
      const resp = await ctx.request.get(iframeSrc);
      const csp = resp.headers()['content-security-policy'] || null;
      out.responseHeaders = {
        status: resp.status(),
        contentSecurityPolicy: csp,
        cspHasSandboxDirective: !!(csp && /(^|;)\s*sandbox(\s|;|$)/.test(csp)),
        permissionsPolicy: resp.headers()['permissions-policy'] || null,
      };
    } catch (e) { out.responseHeaders = { error: String(e).slice(0, 200) }; }
  }

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({
    user: USER, mode: EXPECT_MODE, loggedIn: out.loggedIn,
    sandbox: out.sandboxAttr,
    isOpaque: out.insideIframe && out.insideIframe.isOpaqueOrigin,
    parentRead: out.insideIframe && out.insideIframe.canReadParentDocument,
    sesskey: out.insideIframe && out.insideIframe.sesskeyRead,
    forms: out.insideIframe && out.insideIframe.canFindForms,
    adminLinks: out.insideIframe && out.insideIframe.adminLinks,
    cspSandbox: out.responseHeaders && out.responseHeaders.cspHasSandboxDirective,
  }, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
