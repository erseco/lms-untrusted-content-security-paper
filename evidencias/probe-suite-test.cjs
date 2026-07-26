// SPDX-License-Identifier: MIT
/*
 * Matriz de verificación: anfitriones del laboratorio (lab/docker-compose.yml)
 * x 2 modos.
 *
 * En modo seguro se exige 0/10, TODAS las demos evaluadas en BLOQUEADO Y
 * result.isOpaqueOrigin === true — un marcador en 0 sin origen opaco no es una
 * celda aislada, es una celda que no aísla nada y da la casualidad de que no
 * alcanzó ninguna de las diez capacidades (embed roto, misconfiguración: no
 * es lo mismo que "el sandbox lo impidió"). En modo legacy se exige n/10 con
 * n > 0 y AL MENOS UNA demo en ESCAPE. El contraste entre las dos columnas es
 * la evidencia: un arnés que no sepa distinguirlas no sirve de nada (por eso
 * el control local del propio README/REPRODUCIBILITY.md se ejecuta antes de
 * tocar el laboratorio).
 *
 * Requiere el laboratorio de lab/ levantado y el artefacto
 * (poc/evil.elpx) ya subido a cada anfitrión: este arnés MIDE, no
 * siembra. Las URLs se pasan por entorno; un anfitrión/modo sin URL se marca
 * SALTADO con el motivo, nunca con un resultado inventado.
 *
 * TARGETS enumera los cuatro anfitriones que soporta la sonda (moodle,
 * wordpress, omeka, nextcloud — poc/probe/src/hosts/index.js). A fecha de
 * escritura, lab/docker-compose.yml SOLO levanta tres (moodle, omeka,
 * nextcloud; ver lab/README.md, "Los tres anfitriones..."): no hay
 * contenedor WordPress en este laboratorio, así que las celdas wordpress/*
 * quedan SALTADAS por diseño hasta que exista uno. Se listan de todos modos
 * para que añadir ese anfitrión al lab sea solo exportar dos variables más.
 */
const { chromium } = require('playwright');
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');

const TARGETS = [
  { host: 'moodle', mode: 'secure', url: process.env.URL_MOODLE_SECURE },
  { host: 'moodle', mode: 'legacy', url: process.env.URL_MOODLE_LEGACY },
  { host: 'wordpress', mode: 'secure', url: process.env.URL_WP_SECURE },
  { host: 'wordpress', mode: 'legacy', url: process.env.URL_WP_LEGACY },
  { host: 'omeka', mode: 'secure', url: process.env.URL_OMEKA_SECURE },
  { host: 'omeka', mode: 'legacy', url: process.env.URL_OMEKA_LEGACY },
  { host: 'nextcloud', mode: 'secure', url: process.env.URL_NC_SECURE },
  { host: 'nextcloud', mode: 'legacy', url: process.env.URL_NC_LEGACY },
];

// Mismos diez vectores y el mismo cómputo que poc/probe/src/core/verdict.js
// (CORE_VECTORS / computeVerdict): se duplican aquí, en vez de importar el
// módulo ES, para no acoplar este arnés Node/CJS al árbol de poc/probe/ (que
// esta tarea tiene prohibido modificar); si esos diez nombres cambian alguna
// vez, este cómputo también se queda desactualizado y hay que actualizarlo a
// mano — es un espejo deliberado, no una reimplementación independiente.
const CORE_VECTORS = [
  'sandboxAllowsSameOrigin', 'canAccessParent', 'canReadParentDocument',
  'canReadParentCookie', 'canFindSesskey', 'canFindCourseEditForms',
  'canFindCourseEditLinks', 'canCallScormApi', 'canUseLocalStorage', 'canUseSessionStorage',
];

function computeVerdict(result) {
  const hit = CORE_VECTORS.filter((k) => result[k] === true);
  const score = hit.length;
  const total = CORE_VECTORS.length;
  const level = score > 0 ? 'bad' : result.isOpaqueOrigin ? 'good' : 'warn';
  return { level, score, total, hit };
}

/*
 * El artefacto es un paquete eXeLearning de varias páginas: index.html es
 * solo el cascarón de navegación (sin sonda embebida); cada página real bajo
 * html/*.html embebe e inicia el bundle por su cuenta y publica
 * window.__EXE_POC_RESULT/_HOST/_MEDIA en SU propio frame. Así que primero
 * se busca un frame que YA tenga el resultado (control local: una sola
 * página, sin cascarón); si ninguno lo tiene, se sigue el enlace de
 * navegación a "6. Ejemplos de impacto" — presente en todas las páginas del
 * paquete — dentro de cada frame candidato, y se reintenta. Esa página
 * también es la elegida para pulsar demos (ver runDemos).
 */
async function findResultFrame(page) {
  for (const frame of page.frames()) {
    const has = await frame.evaluate(() => Boolean(window.__EXE_POC_RESULT)).catch(() => false);
    if (has) return frame;
  }
  return null;
}

async function navigateToImpactPage(page) {
  for (const frame of page.frames()) {
    const link = frame.locator('a[href*="6-ejemplos-de-impacto"]').first();
    let count = 0;
    try { count = await link.count(); } catch (e) { count = 0; }
    if (!count) continue;
    try {
      await link.click({ timeout: 5000 });
    } catch (e) {
      // Fallback: navegación directa por si el enlace no es "clicable"
      // (oculto tras CSS del anfitrión, etc.) — mismo destino, sin depender
      // de la geometría del layout.
      const href = await frame.evaluate(() => {
        const a = document.querySelector('a[href*="6-ejemplos-de-impacto"]');
        return a ? new URL(a.getAttribute('href'), location.href).href : null;
      }).catch(() => null);
      if (!href) continue;
      await frame.evaluate((h) => { window.location.href = h; }, href).catch(() => {});
    }
    await frame.waitForLoadState('domcontentloaded').catch(() => {});
    await frame.waitForTimeout(500);
    return true;
  }
  return false;
}

async function probeFrame(page) {
  let frame = await findResultFrame(page);
  if (frame) return frame;
  const navigated = await navigateToImpactPage(page);
  if (navigated) frame = await findResultFrame(page);
  if (frame) return frame;
  throw new Error('no se encontró ningún frame con __EXE_POC_RESULT (ni directo ni tras navegar a la página 6, "Ejemplos de impacto")');
}

/*
 * Pulsa cada demo que encuentre y lee su chip de estado (BLOQUEADO / ESCAPE /
 * INDETERMINADO). Dos disposiciones de marcado conviven en el artefacto,
 * mismos atributos data-demo/data-chip en ambas (ver
 * poc/probe/src/ui/demos-view.js:demoBlock, compartida por las dos):
 *
 *   - Shadow DOM (#exe-poc-result → shadowRoot), pestaña "Demostración" del
 *     panel — vista "completo". Es lo único que usan las 21 páginas REALES
 *     del artefacto ya publicado hoy (todas piden "medicion" o "linea"; ver
 *     poc/suite-src/spec.json), así que en la matriz real esta rama no
 *     encuentra nada — pero es la vista por defecto del bundle si nadie fija
 *     window.__EXE_POC_VIEW, así que el control local (sin ese flag) SÍ la
 *     ejercita, y sigue siendo el camino correcto si algún día una página
 *     vuelve a pedir "completo".
 *   - DOM normal (luz), montado por mountInlineDemos en los contenedores
 *     [data-exe-probe-demo-host]. La página 6 ("Ejemplos de impacto") trae el
 *     contenedor host="showcase": cinco demos de la vitrina de impacto
 *     (voltear, terminal, login falso, logo, aviso), agnósticas de
 *     plataforma, que NO escriben nada persistente en el anfitrión (se
 *     retiran solas). Es la única batería que tiene sentido pulsar en un
 *     arnés que se re-ejecuta para generar evidencia: las demos específicas
 *     de plataforma (51-moodle.html, etc.) SÍ escriben de verdad (renombran
 *     el usuario, crean un curso) y viven en páginas aparte — están fuera de
 *     este arnés a propósito, no por descuido.
 */
async function runDemos(frame) {
  const ids = await frame.evaluate(() => {
    const root = document.getElementById('exe-poc-result');
    if (root && root.shadowRoot) {
      const tabs = [...root.shadowRoot.querySelectorAll('[role="tab"]')];
      const demoTab = tabs.find((t) => t.textContent === 'Demostración');
      if (demoTab) demoTab.click();
      const shadowIds = [...root.shadowRoot.querySelectorAll('button[data-demo]')]
        .map((b) => b.getAttribute('data-demo'));
      if (shadowIds.length) return shadowIds;
    }
    return [...document.querySelectorAll('button[data-demo]')].map((b) => b.getAttribute('data-demo'));
  });

  const out = [];
  for (const id of ids) {
    await frame.evaluate((demoId) => {
      const root = document.getElementById('exe-poc-result');
      const inShadow = root && root.shadowRoot && root.shadowRoot.querySelector(`button[data-demo="${demoId}"]`);
      const btn = inShadow || document.querySelector(`button[data-demo="${demoId}"]`);
      if (btn) btn.click();
    }, id);
    await frame.waitForTimeout(1500);
    const state = await frame.evaluate((demoId) => {
      const root = document.getElementById('exe-poc-result');
      const inShadow = root && root.shadowRoot && root.shadowRoot.querySelector(`[data-chip="${demoId}"]`);
      const chip = inShadow || document.querySelector(`[data-chip="${demoId}"]`);
      const text = chip ? chip.textContent : '';
      if (/BLOQUEADO/.test(text)) return 'contained';
      if (/ESCAPE/.test(text)) return 'escaped';
      if (/INDETERMINADO/.test(text)) return 'unknown';
      return 'idle';
    }, id);
    out.push({ id, state });
  }
  return out;
}

function evaluate(target, verdict, demos, result) {
  const failed = [];
  if (target.mode === 'secure') {
    if (verdict.score !== 0) failed.push(`marcador ${verdict.score}/${verdict.total}, se esperaba 0`);
    for (const d of demos) {
      if (d.state !== 'contained') failed.push(`demo ${d.id}: ${d.state}, se esperaba contained`);
    }
    // Un marcador en 0 no basta: una celda que no alcanza nada porque la
    // página no aísla nada (embed roto, misconfiguración) puntúa igual que
    // una celda realmente opaca. isOpaqueOrigin distingue "no se midió
    // ninguna fuga" de "esto no está realmente aislado" — sin esto, una
    // celda secure mal montada pasaría como si el modo seguro funcionase.
    if (result && result.isOpaqueOrigin !== true) {
      failed.push('isOpaqueOrigin=false: esta celda no está realmente aislada (no es que no se haya filtrado nada)');
    }
  } else {
    if (verdict.score === 0) failed.push('marcador 0, se esperaba al menos 1 capacidad alcanzada');
    if (!demos.some((d) => d.state === 'escaped')) failed.push('ninguna demo alcanzó ESCAPE');
  }
  if (demos.length === 0) failed.push('no se encontró ninguna demo que pulsar (ni shadow DOM ni inline)');
  return { ok: failed.length === 0, failed };
}

(async () => {
  const browser = await chromium.launch();
  let bad = 0;
  let ran = 0;

  for (const target of TARGETS) {
    if (!target.url) {
      console.log(`SALTADO ${target.host}/${target.mode}: sin URL en el entorno`);
      continue;
    }
    ran += 1;
    const context = await browser.newContext({ storageState: process.env.STORAGE_STATE || undefined });
    const page = await context.newPage();
    try {
      try {
        await page.goto(target.url, { waitUntil: 'networkidle', timeout: 45000 });
      } catch (e) {
        // Algunos anfitriones nunca llegan a "networkidle" (polling de
        // fondo); domcontentloaded es suficiente para que el iframe del
        // paquete ya esté en el DOM.
        await page.goto(target.url, { waitUntil: 'domcontentloaded' });
      }

      const frame = await probeFrame(page);
      const result = await frame.evaluate(() => window.__EXE_POC_RESULT);
      const hostDetected = await frame.evaluate(() => window.__EXE_POC_HOST);
      const media = await frame.evaluate(() => window.__EXE_POC_MEDIA);

      const verdict = computeVerdict(result);
      const demos = await runDemos(frame);
      const asserts = evaluate(target, verdict, demos, result);
      if (!asserts.ok) bad += 1;

      const payload = {
        _comment: 'Generado por evidencias/probe-suite-test.cjs. Mide el veredicto (poc/probe/src/core/verdict.js) ' +
          'y pulsa, una a una, las demos de la vitrina de impacto (host-agnósticas, no persistentes) de la página ' +
          '"6. Ejemplos de impacto" del artefacto. No siembra nada: el .elpx debe estar ya subido al anfitrión.',
        host: target.host, mode: target.mode, url: target.url,
        verdict, result, host_detected: hostDetected, media, demos, asserts,
      };
      const file = join(__dirname, `resultados-probe-suite-${target.host}-${target.mode}.json`);
      writeFileSync(file, JSON.stringify(payload, null, 2) + '\n');
      console.log(`${asserts.ok ? 'OK   ' : 'FALLO'} ${target.host}/${target.mode} → ${file}`);
      for (const f of asserts.failed) console.log('   -', f);
    } catch (e) {
      bad += 1;
      console.log(`ERROR ${target.host}/${target.mode}: ${(e && e.message) || e}`);
    } finally {
      await context.close();
    }
  }

  await browser.close();
  if (ran === 0) {
    console.log('\nNinguna celda tenía URL en el entorno: nada que evaluar (ver SALTADO arriba).');
  }
  process.exit(bad ? 1 : 0);
})();
