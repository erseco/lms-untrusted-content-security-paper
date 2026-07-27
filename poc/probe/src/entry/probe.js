/*
 * Punto de entrada: medir → publicar → montar.
 *
 * Si el montaje del panel falla, el artefacto no puede quedarse mudo: cae a un
 * <pre> con el JSON.
 */
import { measure } from '../core/measure.js';
import { measureMedia } from '../core/media.js';
import { computeVerdict } from '../core/verdict.js';
import { createJournal } from '../core/journal.js';
import { ADAPTERS, detectHost } from '../hosts/index.js';
import { createContext } from '../hosts/contract.js';
import { createShowcase } from '../hosts/showcase.js';
import { mountPanel } from '../ui/panel.js';
import { renderChecks } from '../ui/checks-view.js';
import { renderDemos, mountInlineDemos } from '../ui/demos-view.js';
import { renderMedicionNative, MEDICION_ATTR, NOSCRIPT_ATTR } from '../ui/medicion-view.js';

const TABS = ['Resumen', 'Detalle', 'Demostración'];

// Cuatro vistas, elegidas por cada página con window.__EXE_POC_VIEW:
//   - 'medicion' — solo el apartado 1: contenido nativo en el propio HTML de
//     la página (tabla de las diez comprobaciones), sin panel ni Shadow DOM.
//   - 'portada' — veredicto grande, nativo y visible arriba del todo en Inicio.
//   - 'linea' — resumen compacto en el flujo, para el resto de apartados.
//   - 'completo' — el panel de pestañas de siempre. Ninguna página del
//     paquete lo pide ya (el apartado 1 pasó a 'medicion'), pero se conserva
//     como comportamiento por defecto: cualquier valor ausente o
//     desconocido de __EXE_POC_VIEW se trata como 'completo', para que nada
//     que ya embeba el bundle sin fijar la variable cambie de
//     comportamiento.
const VIEW_LINEA = 'linea';
const VIEW_PORTADA = 'portada';
const VIEW_COMPLETO = 'completo';
const VIEW_MEDICION = 'medicion';

function resolveView(win) {
  const v = win && win.__EXE_POC_VIEW;
  if (v === VIEW_LINEA) return VIEW_LINEA;
  if (v === VIEW_PORTADA) return VIEW_PORTADA;
  if (v === VIEW_MEDICION) return VIEW_MEDICION;
  return VIEW_COMPLETO;
}

const VERDICT_COLORS = {
  good: ['#e9f7ee', '#0a7d28', '#07601e'],
  bad: ['#fdeaec', '#b00020', '#8e0019'],
  warn: ['#fff6e5', '#b06f00', '#8a5600'],
};

// Resumen de una línea: mismo veredicto que pintaría la vista completa (el
// mismo objeto `verdict`, calculado igual en los dos casos), sin pestañas ni
// tabla — el detalle de las diez comprobaciones vive solo en el apartado 1.
// No debe insinuar ninguna medida que la vista completa no haya hecho
// también: por eso pinta exactamente icon/title/score/total de `verdict` y
// nada más.
function buildLineaSummary(doc, verdict) {
  const colors = VERDICT_COLORS[verdict.level] || VERDICT_COLORS.warn;

  const wrap = doc.createElement('div');
  wrap.setAttribute('data-view-linea', '');

  const line = doc.createElement('p');
  line.style.cssText =
    'margin:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;' +
    'font:12.5px system-ui,sans-serif;color:#3c434c';

  const icon = doc.createElement('span');
  icon.textContent = verdict.icon;
  icon.style.cssText = 'font-size:15px;line-height:1';

  const title = doc.createElement('b');
  title.textContent = verdict.title;
  title.style.color = colors[2];

  const score = doc.createElement('span');
  score.textContent = verdict.score + ' de ' + verdict.total;
  score.style.cssText =
    'font:11px ui-monospace,Menlo,monospace;padding:1px 7px;border-radius:9px;' +
    'background:' + colors[0] + ';color:' + colors[2];

  line.append(icon, title, score);

  const pointer = doc.createElement('p');
  pointer.setAttribute('data-view-linea-pointer', '');
  pointer.style.cssText = 'margin:4px 0 0;font-size:11px;color:#5a6068';
  pointer.textContent =
    'Medido en esta página. Las diez comprobaciones, en el apartado 1.';

  wrap.append(line, pointer);
  return wrap;
}

// El resumen de línea vive en el flujo de la página, dentro del contenedor
// que exelib.py emite con el aviso de «no se ejecutó»: montarlo en un panel
// duplicaba el título (el del iDevice y el de la cabecera del panel) y
// colgaba controles de flotar y minimizar de una sola línea de texto.
//
// Devuelve false si no hay contenedor —un embebido que fije
// __EXE_POC_VIEW='linea' sin el HTML del generador—, y entonces startProbe
// cae al panel: el artefacto nunca se queda mudo.
const LINEA_ATTR = 'data-exe-probe-linea';
const LINEA_MOUNTED_ATTR = 'data-exe-probe-linea-mounted';

function mountLineaInline(doc, verdict) {
  try {
    const container = doc.querySelector && doc.querySelector('[' + LINEA_ATTR + ']');
    if (!container) return false;
    if (container.getAttribute(LINEA_MOUNTED_ATTR) === 'true') return true;
    // Primero pintar, luego retirar el aviso: si esto lanza, lo que queda en
    // pantalla sigue diciendo que no hubo medición.
    container.appendChild(buildLineaSummary(doc, verdict));
    const aviso = container.querySelector('[' + NOSCRIPT_ATTR + ']');
    if (aviso) aviso.hidden = true;
    container.setAttribute(LINEA_MOUNTED_ATTR, 'true');
    return true;
  } catch (e) {
    return false;
  }
}

// Portada: el mismo objeto de veredicto que usan las demás vistas, con
// jerarquía y contraste suficientes para entender una captura sin abrir el
// apartado 1. Todo se construye con textContent; ningún valor medido pasa por
// innerHTML.
function buildPortadaSummary(doc, verdict) {
  const colors = VERDICT_COLORS[verdict.level] || VERDICT_COLORS.warn;
  const box = doc.createElement('section');
  box.setAttribute('data-view-portada', '');
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', 'polite');
  box.style.cssText =
    'margin:0;padding:18px 20px;border-left:6px solid ' + colors[1] + ';' +
    'background:' + colors[0] + ';color:' + colors[2] + ';border-radius:8px';

  const heading = doc.createElement('p');
  heading.style.cssText =
    'margin:0 0 10px;display:flex;align-items:center;gap:10px;' +
    'font:700 20px/1.25 system-ui,sans-serif';

  const icon = doc.createElement('span');
  icon.textContent = verdict.icon;
  icon.setAttribute('aria-hidden', 'true');
  icon.style.cssText = 'font-size:24px;line-height:1';

  const title = doc.createElement('span');
  title.textContent = verdict.title;
  heading.append(icon, title);

  const text = doc.createElement('p');
  text.textContent = verdict.text;
  text.style.cssText =
    'margin:0;font:17px/1.55 system-ui,sans-serif;color:' + colors[2];

  const pointer = doc.createElement('p');
  pointer.style.cssText =
    'margin:10px 0 0;font:12px/1.45 system-ui,sans-serif;color:#5a6068';
  pointer.appendChild(doc.createTextNode(
    'Detalle completo de las diez comprobaciones en el ',
  ));
  const detailLink = doc.createElement('a');
  detailLink.textContent = 'apartado 1';
  detailLink.href = detailHref(doc);
  detailLink.style.cssText = 'color:inherit;font-weight:700;text-decoration:underline';
  pointer.append(detailLink, doc.createTextNode('.'));

  box.append(heading, text, pointer);
  return box;
}

function detailHref(doc) {
  try {
    if (doc.querySelector('[data-exe-probe-medicion]')) {
      return '#exe-poc-results-title';
    }
    const generatedLink = doc.querySelector(
      'a[href*="1-resultado-de-la-medicion"]',
    );
    if (generatedLink) return generatedLink.getAttribute('href');
  } catch (e) { /* usa la ruta estándar de la portada */ }
  return 'html/1-resultado-de-la-medicion.html';
}

const PORTADA_ATTR = 'data-exe-probe-portada';
const PORTADA_MOUNTED_ATTR = 'data-exe-probe-portada-mounted';

function mountPortadaInline(doc, verdict) {
  try {
    const container = doc.querySelector && doc.querySelector('[' + PORTADA_ATTR + ']');
    if (!container) return false;
    if (container.getAttribute(PORTADA_MOUNTED_ATTR) === 'true') return true;
    container.appendChild(buildPortadaSummary(doc, verdict));
    const aviso = container.querySelector('[' + NOSCRIPT_ATTR + ']');
    if (aviso) aviso.hidden = true;
    container.setAttribute(PORTADA_MOUNTED_ATTR, 'true');
    return true;
  } catch (e) {
    return false;
  }
}

// Anfitriones con batería propia (el genérico no tiene demos).
const DEMO_ADAPTERS = ADAPTERS.filter((a) => a.demos.length);

// Opciones fijas del desplegable de la pestaña Demostración: los cuatro
// anfitriones, siempre, sin depender de cuál esté seleccionado.
const HOSTS_FOR_SELECT = DEMO_ADAPTERS.map((a) => ({ id: a.id, label: a.label }));

// El anfitrión del panel anclado: el bloque que envuelve el <script> de la
// sonda, cuando se conoce. En una página real, el autoarranque de más abajo
// captura document.currentScript de forma síncrona (antes de que el
// arranque, diferido con setTimeout, lo deje en null) y lo pasa aquí como
// options.scriptEl.
function scriptAnchor(options) {
  try {
    const el = options && options.scriptEl;
    return (el && el.parentElement) || null;
  } catch (e) {
    return null;
  }
}

function safeStorage(win) {
  try {
    void win.sessionStorage.length;
    return win.sessionStorage;
  } catch (e) {
    return null;
  }
}

// Botones «Acciones disponibles» (5.1-5.4) y «Qué vería la persona usuaria»
// (6): exelib.py marca su contenedor con este atributo, valor = id de
// adaptador ('moodle'|'wordpress'|'omeka'|'nextcloud') o 'showcase'. Se
// buscan en TODO el documento, no solo dentro del panel, porque viven en el
// propio cuerpo de la página (iDevice de texto), no en el Shadow DOM.
const INLINE_DEMO_HOST_ATTR = 'data-exe-probe-demo-host';
const INLINE_DEMO_IDS_ATTR = 'data-exe-probe-demo-ids';
const INLINE_DEMO_MOUNTED_ATTR = 'data-exe-probe-demo-host-mounted';

function demosFor(hostId, showcase, requestedIds) {
  let demos;
  if (hostId === 'showcase') demos = showcase.demos;
  const adapter = ADAPTERS.find((a) => a.id === hostId);
  if (!demos) demos = (adapter && adapter.demos) || [];
  if (!requestedIds.length) return demos;

  const byId = new Map(demos.map((demo) => [demo.id, demo]));
  return requestedIds.map((id) => byId.get(id)).filter(Boolean);
}

function requestedDemoIds(container) {
  const value = container.getAttribute(INLINE_DEMO_IDS_ATTR) || '';
  return value.trim() ? value.trim().split(/[\s,]+/) : [];
}

// Idempotente por contenedor (marca INLINE_DEMO_MOUNTED_ATTR), así que
// llamar a startProbe() más de una vez —como hacen los tests, o un montaje
// que se reintenta— no duplica botones. Nunca debe romper la página: si el
// documento no tiene querySelectorAll (p. ej. el doc roto de los tests de
// fallback) simplemente no hace nada.
function mountInlineDemoHosts(doc, ctx, journal, showcase, isOpaqueOrigin) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return;
  let containers;
  try {
    containers = doc.querySelectorAll('[' + INLINE_DEMO_HOST_ATTR + ']');
  } catch (e) {
    return;
  }
  const scene = { doc, ctx, journal, isOpaqueOrigin };
  for (let i = 0; i < containers.length; i++) {
    const container = containers[i];
    if (container.getAttribute(INLINE_DEMO_MOUNTED_ATTR) === 'true') continue;
    try {
      mountInlineDemos(
        doc,
        container,
        demosFor(
          container.getAttribute(INLINE_DEMO_HOST_ATTR),
          showcase,
          requestedDemoIds(container),
        ),
        scene,
      );
    } catch (e) { /* nunca debe romper la página */ }
    container.setAttribute(INLINE_DEMO_MOUNTED_ATTR, 'true');
  }
}

function fallback(doc, result) {
  try {
    // Igual que el panel: si ya hay un exe-poc-result (de un fallback previo
    // o de un montaje que sí cuajó), no se duplica.
    if (doc.getElementById && doc.getElementById('exe-poc-result')) return;
    const pre = doc.createElement('pre');
    pre.id = 'exe-poc-result';
    pre.textContent = JSON.stringify(result, null, 2);
    (doc.body || doc.documentElement).appendChild(pre);
  } catch (e) { /* si esto también falla, no queda nada que hacer */ }
}

export function startProbe(options) {
  const win = (options && options.win) || window;
  const doc = (options && options.doc) || win.document;
  const buildId = (options && options.buildId) || 'dev';

  const allowSelfHost = win.__EXE_POC_ALLOW_SELF_HOST === true;
  const result = measure(win, { allowSelfHost });
  const media = measureMedia(win.document);
  const journal = createJournal({ buildId, storage: safeStorage(win) });
  // mod_page no usa iframe: el HTML vive en el documento superior. Solo su
  // artefacto canónico activa esta excepción explícita; el resto de embebidos
  // conserva la regla normal de exigir un padre distinto y alcanzable.
  const ctx = createContext({ win, journal, buildId, allowSelfHost });
  const showcase = createShowcase({ buildId, timeoutMs: 60000 });

  let hostInfo;
  try {
    const detected = detectHost(ctx);
    let measures = {};
    try { measures = detected.adapter.measure(ctx) || {}; } catch (e) { measures = {}; }
    hostInfo = {
      adapter: detected.adapter,
      matched: detected.matched,
      confidence: detected.confidence,
      signals: detected.signals,
      measures,
    };
  } catch (e) {
    hostInfo = {
      adapter: { id: 'generic', label: 'Anfitrión no identificado' },
      matched: false, confidence: 'weak', signals: [], measures: {},
    };
  }

  try {
    win.__EXE_POC_RESULT = result;
    win.__EXE_POC_HOST = {
      id: hostInfo.adapter.id, label: hostInfo.adapter.label,
      matched: hostInfo.matched, confidence: hostInfo.confidence, signals: hostInfo.signals,
    };
    win.__EXE_POC_MEDIA = media;
  } catch (e) { /* ignorado */ }
  try { win.console.log('[EXE-POC] ' + JSON.stringify(result)); } catch (e) { /* ignorado */ }

  // Botones en el propio cuerpo de la página (apartados 5.1-5.4 y 6): se
  // montan siempre, independientemente de si el panel flotante ya lo estaba
  // o de qué vista pida esta página, con exactamente los mismos demo.run()
  // y los mismos chips de tres estados que la pestaña Demostración.
  mountInlineDemoHosts(doc, ctx, journal, showcase, result.isOpaqueOrigin);

  const verdict = computeVerdict(result);
  const requestedView = resolveView(win);
  // El resumen superior puede convivir con la tabla completa de
  // evil-page.html: si existe su marcador, se pinta en cualquier vista.
  const portadaMounted = mountPortadaInline(doc, verdict);

  // Apartado 1: contenido nativo, ya en el propio HTML de la página (sin
  // panel, sin Shadow DOM). Termina aquí — nada de lo que sigue (guard de
  // #exe-poc-result, mountPanel) aplica a esta vista.
  if (requestedView === VIEW_MEDICION) {
    try {
      const container = doc.querySelector && doc.querySelector('[' + MEDICION_ATTR + ']');
      if (container) renderMedicionNative(doc, container, { result, verdict });
    } catch (e) { /* nunca debe romper la página */ }
    return null;
  }

  // Inicio: veredicto destacado en el primer bloque de la página.
  if (requestedView === VIEW_PORTADA && portadaMounted) return null;

  // Vista línea (los otros 18 apartados): también en el flujo, sin panel.
  // Si el contenedor no está, sigue hacia mountPanel más abajo.
  if (requestedView === VIEW_LINEA && mountLineaInline(doc, verdict)) return null;

  // Medir/detectar/publicar corre igual aunque el panel ya esté montado: es
  // barato, mantiene __EXE_POC_RESULT/_HOST/_MEDIA al día en cada llamada, y
  // así el guard de abajo solo tiene que preocuparse del DOM, no de si hay
  // que repetir el resto del trabajo.
  const existing = doc.getElementById && doc.getElementById('exe-poc-result');
  if (existing && existing.getAttribute('data-mounted') === 'true') return null;

  let selectedHostId = hostInfo.adapter.id === 'generic' ? ADAPTERS[0].id : hostInfo.adapter.id;

  try {
    let container;

    if (requestedView === VIEW_LINEA) {
      container = buildLineaSummary(doc, verdict);
    } else if (requestedView === VIEW_PORTADA) {
      container = buildPortadaSummary(doc, verdict);
    } else {
      container = doc.createElement('div');

      const tablist = doc.createElement('div');
      tablist.setAttribute('role', 'tablist');
      tablist.style.cssText = 'display:flex;border-bottom:1px solid #e2e6ec;margin:-10px -11px 10px';

      const view = doc.createElement('div');

      const paint = (name) => {
        view.textContent = '';
        if (name === 'Demostración') {
          const selected = DEMO_ADAPTERS.find((a) => a.id === selectedHostId) || DEMO_ADAPTERS[0];
          view.appendChild(renderDemos({
            doc, ctx, journal, showcase,
            adapters: [selected],
            hostsForSelect: HOSTS_FOR_SELECT,
            isOpaqueOrigin: result.isOpaqueOrigin,
            selectedHostId,
            onSelectHost: (id) => {
              selectedHostId = id;
              paint('Demostración');
            },
          }));
        } else {
          view.appendChild(renderChecks({
            doc, result, verdict, hostInfo, media,
            isOpaqueOrigin: result.isOpaqueOrigin,
            detail: name === 'Detalle',
          }));
        }
      };

      const buttons = TABS.map((name, i) => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.textContent = name;
        b.setAttribute('role', 'tab');
        b.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
        b.style.cssText =
          'flex:1;border:0;background:transparent;padding:7px 4px;cursor:pointer;' +
          'font:inherit;border-bottom:2px solid ' + (i === 0 ? '#0b57d0' : 'transparent');
        b.addEventListener('click', () => {
          buttons.forEach((other, j) => {
            const on = j === i;
            other.setAttribute('aria-selected', on ? 'true' : 'false');
            other.style.borderBottomColor = on ? '#0b57d0' : 'transparent';
          });
          paint(name);
        });
        tablist.appendChild(b);
        return b;
      });

      container.append(tablist, view);
      paint(TABS[0]);
    }

    const panel = mountPanel({
      doc,
      title: 'Sonda de aislamiento',
      subtitle: 'exe-probe-suite · build ' + buildId,
      body: container,
      buildId,
      storage: safeStorage(win),
      // Ancla preferida: el elemento que envuelve el propio <script> de la
      // sonda, para que el panel caiga dentro del iDevice que lo lleva en
      // vez de al final de un `main`/`body` genérico. mountPanel ya sabe caer
      // a main y luego a body si esto no está disponible.
      anchorTo: scriptAnchor(options),
    });
    panel.root.setAttribute('data-mounted', 'true');
    panel.root.setAttribute('data-view', requestedView);
    return panel;
  } catch (e) {
    fallback(win.document, result);
    return null;
  }
}

// Autoarranque cuando el bundle se carga en una página real.
if (typeof window !== 'undefined' && !window.__EXE_POC_NO_AUTOSTART) {
  // document.currentScript solo es válido durante la ejecución síncrona de
  // este <script>: hay que leerlo aquí mismo, no dentro de boot(), que corre
  // más tarde (DOMContentLoaded o un setTimeout) cuando ya vale null.
  var bootScriptEl = typeof document !== 'undefined' ? document.currentScript : null;
  const boot = () => startProbe({
    win: window, buildId: window.__EXE_POC_BUILD_ID || 'dev', scriptEl: bootScriptEl,
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0));
  } else {
    setTimeout(boot, 0);
  }
}
