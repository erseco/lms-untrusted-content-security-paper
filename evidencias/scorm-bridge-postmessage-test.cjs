// SPDX-License-Identifier: MIT
//
// W3 — Adversarial test of the secure-mode SCORM postMessage bridge.
//
// Drives the REAL parent-side relay (mod_exelearning js/scorm_bridge_relay.js) against a
// hostile in-iframe sender and confirms its validation predicate:
//   accept iff  event.source === iframe.contentWindow   (window identity, unforgeable)
//          AND  data.type === 'scorm'
//          AND  data.action in {ready, track}            (closed action list)
//          AND  data.exelearningBridge === <per-view nonce>   (track only)
//          AND  data.cmi is an object                    (shape)
// Everything else is ignored silently (no track.php POST).
//
// The relay deliberately does NOT trust event.origin (an opaque origin has origin "null"),
// so this test shows the bridge does not reintroduce the H5P "postMessage with '*' and no
// origin check" flaw the paper criticises (Sec 4.4): identity + nonce replace origin.
//
// Acceptance is observed by stubbing window.fetch / navigator.sendBeacon and checking
// whether the relay performed the authenticated track POST for each case. The nonce is
// deliberately LEAKED to the attacker to prove identity (not nonce secrecy) is the barrier.
//
// Run:  NODE_PATH=/path/to/mod_exelearning_3/node_modules \
//       RELAY_PATH=/path/to/mod_exelearning_3/js/scorm_bridge_relay.js \
//       node evidencias/scorm-bridge-postmessage-test.cjs
//
// No Moodle server is required: the test loads the relay source directly.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const RELAY_PATH = process.env.RELAY_PATH
  || '/Users/ernesto/Downloads/git/mod_exelearning_3/js/scorm_bridge_relay.js';
const OUT = process.env.OUT || path.join(__dirname, 'resultados-postmessage-bridge.json');

const NONCE = 'aZ09aZ09aZ09aZ09aZ09aZ09aZ09aZ09';            // 32 chars, as random_string(32)
const TRACKURL = '/mod/exelearning/track.php?id=1&sesskey=PARENT_ONLY';

const CHILD_SRCDOC = `<!doctype html><meta charset=utf-8><script>
var learned = null;
addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.type === 'scorm' && d.action === 'config') { learned = d.nonce; return; }
  if (d.__cmd === 'ready')       { parent.postMessage({exelearningBridge:null,type:'scorm',action:'ready'}, '*'); return; }
  if (d.__cmd === 'emit')        { parent.postMessage(d.msg, '*'); return; }
  if (d.__cmd === 'emitLearned') { parent.postMessage({exelearningBridge:learned,type:'scorm',action:'track',cmi:(d.cmi||{lesson_status:'completed'})}, '*'); return; }
});
<\/script>`;
const ATTACKER_SRCDOC = `<!doctype html><meta charset=utf-8><script>
addEventListener('message', function (e) {
  var d = e.data || {};
  if (d.__cmd === 'emit') { parent.postMessage(d.msg, '*'); }
});
<\/script>`;

(async () => {
  const relaySrc = fs.readFileSync(RELAY_PATH, 'utf8');
  const relaySha = crypto.createHash('sha256').update(relaySrc).digest('hex');
  const pageerrors = [];

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => pageerrors.push(String(e)));

  await page.setContent('<!doctype html><html><body><h1>bridge harness</h1></body></html>', { waitUntil: 'load' });

  // 1) Load the REAL relay (defines window.exeScormBridge).
  await page.addScriptTag({ content: relaySrc });

  // 2) Stub fetch/sendBeacon, build the genuine + attacker iframes, wait for both to load.
  await page.evaluate(async ({ childDoc, attackerDoc }) => {
    window.__fetchCalls = [];
    window.__beaconCalls = [];
    window.fetch = (u, o) => { window.__fetchCalls.push({ url: String(u), body: o && o.body }); return Promise.resolve({ ok: true }); };
    if (window.navigator && window.navigator.sendBeacon) {
      window.navigator.sendBeacon = (u) => { window.__beaconCalls.push(String(u)); return true; };
    }
    const mk = (id, srcdoc) => new Promise((res) => {
      const f = document.createElement('iframe');
      f.id = id; if (id === 'exelearningobject') { f.name = id; }
      f.addEventListener('load', () => res(f));
      f.srcdoc = srcdoc;
      document.body.appendChild(f);
    });
    await mk('exelearningobject', childDoc);   // the genuine opaque package frame
    await mk('attacker', attackerDoc);         // a malicious co-resident frame
  }, { childDoc: CHILD_SRCDOC, attackerDoc: ATTACKER_SRCDOC });

  // 3) Boot the relay exactly as view.php does in secure mode.
  await page.evaluate(({ nonce, trackurl }) => {
    window.exeScormBridge.init({
      iframeid: 'exelearningobject', cmid: 1, trackurl,
      session: 'sess0000000000000000', nonce, teachermodevisible: 0,
      blockedid: 'exelearning-secure-blocked',
    });
  }, { nonce: NONCE, trackurl: TRACKURL });

  const sleep = (ms) => page.waitForTimeout(ms);

  // Run one case (a function evaluated in the page with {NONCE, VALID}); return accepted?
  async function caseRun(fn) {
    const before = await page.evaluate(() => window.__fetchCalls.length);
    await page.evaluate(fn, { NONCE, VALID: { type: 'scorm', action: 'track', cmi: { lesson_status: 'completed', score_raw: '100' }, exelearningBridge: NONCE } });
    await sleep(220);
    const after = await page.evaluate(() => window.__fetchCalls.length);
    return after > before;
  }

  const results = [];
  const record = (name, expected, accepted, note) => results.push({ name, expected, accepted, pass: expected === (accepted ? 'accept' : 'reject'), note });

  record('attacker_valid_leaked_nonce', 'reject', await caseRun(({ VALID }) => {
    document.getElementById('attacker').contentWindow.postMessage({ __cmd: 'emit', msg: VALID }, '*');
  }), 'forged co-resident frame, correct type+action+nonce+cmi; must fail event.source===iframe.contentWindow');

  record('topwindow_self_post', 'reject', await caseRun(({ VALID }) => {
    window.postMessage(VALID, '*');
  }), 'top window self-post; e.source===window!==iframe.contentWindow');

  record('child_wrong_nonce', 'reject', await caseRun(() => {
    document.getElementById('exelearningobject').contentWindow.postMessage({ __cmd: 'emit', msg: { type: 'scorm', action: 'track', cmi: { x: 1 }, exelearningBridge: 'WRONG_NONCE' } }, '*');
  }), 'real frame, valid identity, bad nonce; acceptTrack() returns false');

  record('child_offlist_action', 'reject', await caseRun(({ NONCE }) => {
    document.getElementById('exelearningobject').contentWindow.postMessage({ __cmd: 'emit', msg: { type: 'scorm', action: 'delete', cmi: { x: 1 }, exelearningBridge: NONCE } }, '*');
  }), 'real frame, correct nonce, action not in {ready,track}');

  record('child_wrong_type', 'reject', await caseRun(({ NONCE }) => {
    document.getElementById('exelearningobject').contentWindow.postMessage({ __cmd: 'emit', msg: { type: 'evil', action: 'track', cmi: { x: 1 }, exelearningBridge: NONCE } }, '*');
  }), 'real frame, correct nonce, type!="scorm"');

  record('child_cmi_not_object', 'reject', await caseRun(({ NONCE }) => {
    document.getElementById('exelearningobject').contentWindow.postMessage({ __cmd: 'emit', msg: { type: 'scorm', action: 'track', cmi: 'not-an-object', exelearningBridge: NONCE } }, '*');
  }), 'real frame, correct nonce, malformed payload shape');

  // Positive control: genuine handshake (ready -> config(nonce)) then a legit track.
  await page.evaluate(() => { document.getElementById('exelearningobject').contentWindow.postMessage({ __cmd: 'ready' }, '*'); });
  await sleep(220);
  record('child_legit_after_handshake', 'accept', await caseRun(() => {
    document.getElementById('exelearningobject').contentWindow.postMessage({ __cmd: 'emitLearned', cmi: { lesson_status: 'completed', score_raw: '100' } }, '*');
  }), 'real frame, nonce learned via ready->config handshake; relay performs the track.php POST');

  const lastFetch = await page.evaluate(() => window.__fetchCalls.slice(-1)[0] || null);
  await browser.close();

  const summary = {
    test: 'scorm-bridge-postmessage (W3 adversarial)',
    engine: 'chromium (Playwright)',
    relay: { path: RELAY_PATH, sha256: relaySha },
    nonce_was_leaked_to_attacker: true,
    validation_predicate: 'event.source===iframe.contentWindow AND type==="scorm" AND action in {ready,track} AND exelearningBridge===nonce AND typeof cmi==="object"',
    cases: results,
    accepted_post_for_legit_case: lastFetch,
    all_pass: results.every((r) => r.pass),
    pageerrors,
  };
  fs.writeFileSync(OUT, JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify({ all_pass: summary.all_pass, cases: results.map((r) => `${r.name}:${r.pass ? 'PASS' : 'FAIL'}(${r.accepted ? 'accepted' : 'rejected'})`) }, null, 2));
  process.exit(summary.all_pass ? 0 : 1);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
