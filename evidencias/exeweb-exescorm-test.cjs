// SPDX-License-Identifier: MIT
//
// Live isolation probe for mod_exeweb and mod_exescorm (stable, same-origin), to
// replace the code-only inference in the paper with an in-execution result. As admin
// it creates a throwaway course, adds an exeweb activity (uploading evil_web.zip — an
// eXeLearning web export with content.xml + the probe) and an exescorm activity
// (uploading evil-exescorm.zip — a SCORM package with content.xml + the probe), then
// reads poc/probe.js's window.__EXE_POC_RESULT from
// INSIDE each package iframe. Read-only probe: booleans + redacted error names only.
//
// Uploads bypass the AJAX filepicker via the Content-Bank/mform technique
// (scrape mform -> repository_ajax upload to the packagefile draft -> submit).
//
// Env: MOODLE_BASE (default http://localhost), EXE_USER (user), EXE_PASS (1234), OUT.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.env.MOODLE_BASE || 'http://localhost').replace(/\/$/, '');
const USER = process.env.EXE_USER || 'user';
const PASS = process.env.EXE_PASS || '1234';
const OUT = process.env.OUT || path.join(__dirname, 'resultados-exeweb-exescorm.json');
const PKG_WEB = fs.readFileSync(path.join(__dirname, '..', 'poc', 'evil_web.zip')).toString('base64');
const PKG_SCORM = fs.readFileSync(path.join(__dirname, '..', 'poc', 'evil-exescorm.zip')).toString('base64');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  const out = {
    _meta: {
      descripcion: 'Sondeo de aislamiento EN EJECUCION de mod_exeweb y mod_exescorm (plugins estables, mismo origen). Sube evil_web.zip (export web eXeLearning con content.xml + probe) y evil-exescorm.zip (SCORM + content.xml), lanza el SCO y lee window.__EXE_POC_RESULT desde DENTRO del iframe del paquete. Solo booleanos; sesskey REDACTADO. Lab desechable, accion autorizada y reversible (curso de usar y tirar).',
      harness: 'evidencias/exeweb-exescorm-test.cjs (admin) + poc/evil_web.zip + poc/evil-exescorm.zip',
      moodle: 'erseco/alpine-moodle:v5.2.1 (Moodle 5.2.1)',
      plugin_commits: { mod_exeweb: '60d24fb', mod_exescorm: 'e985f4d' },
      engine: 'chromium (Playwright)',
      fecha: '2026-06-16',
    },
    base: BASE, user: USER, results: {},
  };

  await page.goto('/login/index.php', { waitUntil: 'networkidle' });
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await Promise.all([page.waitForLoadState('domcontentloaded'), page.click('#loginbtn')]);
  out.loggedIn = !/login\/index\.php/.test(page.url());
  if (!out.loggedIn) { out.error = 'login failed'; fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n'); console.log('LOGIN FAILED'); await browser.close(); process.exit(3); }

  // --- create a throwaway course ---
  out.courseId = await page.evaluate(async () => {
    const root = window.M.cfg.wwwroot;
    const pickForm = (h) => [].slice.call(new DOMParser().parseFromString(h, 'text/html').querySelectorAll('form')).filter((f) => f.querySelector('input[name^="_qf__"]')).sort((a, b) => b.querySelectorAll('input,select,textarea').length - a.querySelectorAll('input,select,textarea').length)[0];
    const getUrl = root + '/course/edit.php?category=1';
    const form = pickForm(await (await fetch(getUrl, { credentials: 'same-origin' })).text());
    if (!form) return null;
    const fd = new FormData(form); fd.delete('cancel');
    fd.set('fullname', 'EXEWEB/EXESCORM probe'); fd.set('shortname', 'EXEPROBE' + Math.floor(Math.random() * 1e6)); fd.set('category', '1');
    const sb = form.querySelector('[name=saveanddisplay]') || form.querySelector('[name=submitbutton]') || form.querySelector('[type=submit][name]');
    if (sb) fd.set(sb.getAttribute('name'), '1');
    const r = await fetch(new URL(form.getAttribute('action') || getUrl, getUrl).href, { method: 'POST', credentials: 'same-origin', body: fd });
    const m = (r.url || '').match(/[?&](?:id|courseid)=(\d+)/);
    return m ? m[1] : null;
  });
  if (!out.courseId) { out.error = 'course create failed'; fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n'); console.log('NO COURSE'); await browser.close(); process.exit(4); }

  // --- add an activity (module) uploading a package, return its view URL ---
  async function addActivity(mod, b64, typeField, typeVal) {
    return page.evaluate(async ({ mod, b64, typeField, typeVal, cid }) => {
      const root = window.M.cfg.wwwroot, sk = window.M.cfg.sesskey;
      const pickForm = (h) => [].slice.call(new DOMParser().parseFromString(h, 'text/html').querySelectorAll('form')).filter((f) => f.querySelector('input[name^="_qf__"]')).sort((a, b) => b.querySelectorAll('input,select,textarea').length - a.querySelectorAll('input,select,textarea').length)[0];
      const getUrl = root + '/course/modedit.php?add=' + mod + '&type=&course=' + cid + '&section=0&return=0&sr=0';
      const html = await (await fetch(getUrl, { credentials: 'same-origin' })).text();
      const form = pickForm(html);
      if (!form) return { ok: false, reason: 'no mform for ' + mod };
      const itEl = form.querySelector('input[name="packagefile"]');
      if (!itEl) return { ok: false, reason: 'no packagefile input', fields: [].slice.call(form.querySelectorAll('input[name]')).map((i) => i.name).slice(0, 30) };
      const itemid = itEl.value;
      const repoId = (html.match(/"id":"?(\d+)"?,"name":"[^"]*","type":"upload"/) || html.match(/"type":"upload"[^}]*"id":"?(\d+)/) || [, '5'])[1] || '5';
      const bin = atob(b64); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
      const ufd = new FormData(); ufd.append('repo_upload_file', new Blob([a], { type: 'application/zip' }), 'pkg.zip'); ufd.append('sesskey', sk); ufd.append('repo_id', repoId); ufd.append('itemid', itemid); ufd.append('savepath', '/'); ufd.append('title', 'pkg.zip'); ufd.append('author', 'PoC'); ufd.append('license', 'allrightsreserved');
      const up = await (await fetch(root + '/repository/repository_ajax.php?action=upload', { method: 'POST', credentials: 'same-origin', body: ufd })).json().catch((e) => ({ ERR: String(e) }));
      const fd = new FormData(form); fd.delete('cancel');
      fd.set('name', mod + ' PoC'); if (typeField) fd.set(typeField, typeVal);
      const sub = form.querySelector('[name=submitbutton2]') || form.querySelector('[name=submitbutton]') || form.querySelector('[type=submit][name]');
      if (sub) fd.set(sub.getAttribute('name'), '1');
      const r = await fetch(new URL(form.getAttribute('action') || (root + '/course/modedit.php'), getUrl).href, { method: 'POST', credentials: 'same-origin', body: fd });
      const respText = await r.text();
      const notice = (() => { const d = new DOMParser().parseFromString(respText, 'text/html'); const n = d.querySelector('.alert-danger,.errormessage,.box.errorbox'); return n ? n.textContent.trim().slice(0, 200) : null; })();
      const created = (r.url || '').indexOf('modedit.php') === -1;
      const m = (r.url || '').match(/\/mod\/[a-z]+\/view\.php\?id=(\d+)/) || respText.match(new RegExp('/mod/' + mod + '/view\\.php\\?id=(\\d+)'));
      return { ok: created, uploadOk: !up.ERR, uploadKeys: Object.keys(up).slice(0, 5), cmid: m ? m[1] : null, finalUrl: (r.url || '').replace(/sesskey=[^&]+/, ''), notice };
    }, { mod, b64, typeField, typeVal, cid: out.courseId });
  }

  // Read poc/probe.js's __EXE_POC_RESULT from inside the package iframe.
  async function probeInside(viewUrlInit) {
    const target = page;
    await page.goto(viewUrlInit, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1500);
    // SCORM-style modules show an entry page whose "launch" form POSTs to player.php
    // (hidden scoid/cm/currentorg). player.php then embeds the SCO iframe
    // (#exescorm_object -> loadSCO.php), which runs the probe. Scrape those fields and
    // GET player.php directly (avoids popup/target-closed races on the form click).
    const launch = await page.evaluate(() => {
      const f = document.querySelector('form[action*="player.php"]');
      if (!f) return null;
      const params = new URLSearchParams();
      f.querySelectorAll('input[name],select[name]').forEach((i) => { if (i.name) params.set(i.name, i.value); });
      if (!params.has('mode')) params.set('mode', 'normal');
      return { action: f.getAttribute('action'), query: params.toString() };
    }).catch(() => null);
    if (launch) {
      const playerUrl = new URL(launch.action, BASE).pathname + '?' + launch.query;
      await page.goto(playerUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
    await page.waitForTimeout(3200);
    const parentSandbox = await target.evaluate(() => { const f = document.querySelector('iframe#exewebobject, iframe#exescorm_object, iframe#scorm_object, iframe[name="scorm_object"], iframe[id*="exe"], iframe[id*="scorm"], iframe[src*="loadSCO"], iframe[src*="pluginfile"]'); return f ? { id: f.id || f.name, sandbox: f.getAttribute('sandbox'), src: (f.getAttribute('src') || '').replace(/pluginfile\.php\/[^/]+\//, 'pluginfile.php/REDACTED/') } : null; }).catch(() => null);
    let inside = null;
    for (const f of target.frames()) {
      if (f === target.mainFrame()) continue;
      const r = await f.evaluate(() => {
        const R = window.__EXE_POC_RESULT;
        if (!R) return null;
        return { isOpaqueOrigin: R.isOpaqueOrigin, sandboxAttr: R.sandboxAttr, canAccessParent: R.canAccessParent, canReadParentDocument: R.canReadParentDocument, canReadParentCookie: R.canReadParentCookie, canFindSesskey: R.canFindSesskey, sesskeyValue: R.sesskeyValue, canCallScormApi: R.canCallScormApi, scormApiFlavor: R.scormApiFlavor, canUseLocalStorage: R.canUseLocalStorage, origin: window.origin };
      }).catch(() => null);
      if (r) { inside = r; break; }
    }
    if (!inside) {
      inside = await target.evaluate(() => {
        const R = window.__EXE_POC_RESULT;
        return R ? { isOpaqueOrigin: R.isOpaqueOrigin, sandboxAttr: R.sandboxAttr, canAccessParent: R.canAccessParent, canReadParentDocument: R.canReadParentDocument, canReadParentCookie: R.canReadParentCookie, canFindSesskey: R.canFindSesskey, sesskeyValue: R.sesskeyValue, canCallScormApi: R.canCallScormApi, scormApiFlavor: R.scormApiFlavor, canUseLocalStorage: R.canUseLocalStorage, origin: window.origin } : null;
      }).catch(() => null);
    }
    return { parentSandbox, inside, launchedUrl: (target.url ? target.url() : '').replace(/sesskey=[^&]+/, '') };
  }

  // --- mod_exeweb (evil_web.zip, exeorigin=local) ---
  const w = await addActivity('exeweb', PKG_WEB, 'exeorigin', 'local');
  out.results.exeweb = { create: w };
  if (w.ok && w.cmid) out.results.exeweb.probe = await probeInside(`/mod/exeweb/view.php?id=${w.cmid}`);

  // --- mod_exescorm (evil-exescorm.zip, exescormtype=local) ---
  const s = await addActivity('exescorm', PKG_SCORM, 'exescormtype', 'local');
  out.results.exescorm = { create: s };
  if (s.ok && s.cmid) out.results.exescorm.probe = await probeInside(`/mod/exescorm/view.php?id=${s.cmid}`);

  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({
    course: out.courseId,
    exeweb: { create: out.results.exeweb.create, inside: out.results.exeweb.probe && out.results.exeweb.probe.inside, sandbox: out.results.exeweb.probe && out.results.exeweb.probe.parentSandbox },
    exescorm: { create: out.results.exescorm.create, inside: out.results.exescorm.probe && out.results.exescorm.probe.inside, sandbox: out.results.exescorm.probe && out.results.exescorm.probe.parentSandbox },
  }, null, 2));
  await browser.close();
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
