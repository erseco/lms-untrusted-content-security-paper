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
import { renderDemos } from '../ui/demos-view.js';

const TABS = ['Resumen', 'Detalle', 'Demostración'];

// Vista completa (panel con pestañas) o línea (resumen compacto en el flujo,
// consolidado en el apartado 1). Cualquier valor ausente o desconocido de
// window.__EXE_POC_VIEW se trata como 'completo', para que nada que ya
// embeba el bundle sin fijar la variable cambie de comportamiento.
const VIEW_LINEA = 'linea';
const VIEW_COMPLETO = 'completo';

function resolveView(win) {
  return win && win.__EXE_POC_VIEW === VIEW_LINEA ? VIEW_LINEA : VIEW_COMPLETO;
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
    'Detalle completo de las diez comprobaciones en el apartado 1, «Resultado de la medición».';

  wrap.append(line, pointer);
  return wrap;
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

  const result = measure(win);
  const media = measureMedia(win.document);
  const journal = createJournal({ buildId, storage: safeStorage(win) });
  const ctx = createContext({ win, journal, buildId });
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

  // Medir/detectar/publicar corre igual aunque el panel ya esté montado: es
  // barato, mantiene __EXE_POC_RESULT/_HOST/_MEDIA al día en cada llamada, y
  // así el guard de abajo solo tiene que preocuparse del DOM, no de si hay
  // que repetir el resto del trabajo.
  const existing = doc.getElementById && doc.getElementById('exe-poc-result');
  if (existing && existing.getAttribute('data-mounted') === 'true') return null;

  const verdict = computeVerdict(result);
  let selectedHostId = hostInfo.adapter.id === 'generic' ? ADAPTERS[0].id : hostInfo.adapter.id;
  const requestedView = resolveView(win);

  try {
    let container;

    if (requestedView === VIEW_LINEA) {
      container = buildLineaSummary(doc, verdict);
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
