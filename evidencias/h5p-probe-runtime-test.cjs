/*
 * Read-only collector for an already-published H5P probe.
 *
 * Required:
 *   H5P_RUNTIME_URL=https://... PLATFORM=moodle|wordpress MODE=div|iframe
 * Optional:
 *   H5P_STORAGE_STATE=/path/to/playwright-storage-state.json
 *
 * The upload/install step remains platform-specific and privileged. This script only
 * opens the resulting POC-SAFE page and searches every frame for the redacted common
 * probe contract.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const url = process.env.H5P_RUNTIME_URL;
const platform = String(process.env.PLATFORM || '').toLowerCase();
const mode = String(process.env.MODE || '').toLowerCase();
const storageState = process.env.H5P_STORAGE_STATE;

if (!url || !['moodle', 'wordpress'].includes(platform) || !['div', 'iframe'].includes(mode)) {
  console.error('Set H5P_RUNTIME_URL, PLATFORM=moodle|wordpress and MODE=div|iframe.');
  process.exit(2);
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext(storageState ? { storageState } : {});
  const page = await context.newPage();
  const consoleHits = [];
  page.on('console', message => {
    if (message.text().includes('[EXE-POC]')) consoleHits.push(message.text().slice(0, 300));
  });

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  let found = null;
  for (const frame of page.frames()) {
    const value = await frame.evaluate(() => {
      const result = window.__EXE_POC_RESULT || null;
      if (!result) return null;
      return {
        result,
        host: window.__EXE_POC_HOST || null,
        media: window.__EXE_POC_MEDIA || null,
        frameUrl: location.href.slice(0, 240),
        frameIsTop: window.parent === window,
        panelMounted: !!document.querySelector('#exe-poc-result')
      };
    }).catch(() => null);
    if (value) {
      found = value;
      break;
    }
  }

  const output = {
    date: new Date().toISOString(),
    browser: 'chromium',
    platform,
    mode,
    targetOrigin: new URL(url).origin,
    frameCount: page.frames().length,
    probe: found,
    consoleHits,
    verdict: {
      executed: !!found,
      nonOpaqueOrigin: !!(found && !found.result.isOpaqueOrigin),
      parentReadable: !!(found && found.result.canReadParentDocument),
      sessionWitnessReachable: !!(
        found &&
        (found.result.canFindSesskey ||
          (found.host && found.host.id === 'wordpress' && found.host.matched))
      )
    }
  };

  const file = path.join(
    __dirname,
    `resultados-h5p-${platform}-${mode}-live.json`
  );
  fs.writeFileSync(file, JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
  await browser.close();
  if (!found) process.exitCode = 1;
})().catch(error => {
  console.error(error);
  process.exit(1);
});
