import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startProbe } from '../src/entry/probe.js';
import { computeVerdict } from '../src/core/verdict.js';

beforeEach(() => {
  document.body.innerHTML = '';
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    transform: 'none', filter: 'none', perspective: 'none', contain: 'none', willChange: 'auto',
  });
  document.elementFromPoint = () => null;
  // jsdom no implementa window.open y lo deja avisado en stderr en cada
  // llamada a measure(); measure() ya trata la excepción, así que el mock
  // solo evita ruido en la salida del test.
  vi.spyOn(window, 'open').mockImplementation(() => null);
});

describe('startProbe', () => {
  it('publica el resultado con el contrato congelado', () => {
    startProbe({ win: window, buildId: 'b1' });
    expect(window.__EXE_POC_RESULT).toBeTruthy();
    expect(window.__EXE_POC_RESULT.parentCookieValue).toBe('REDACTED');
    expect(window.__EXE_POC_RESULT.canSubmitCourseEditForm).toBe('not_attempted');
  });

  it('publica el anfitrión detectado y la media medida', () => {
    startProbe({ win: window, buildId: 'b1' });
    expect(window.__EXE_POC_HOST).toHaveProperty('id');
    expect(window.__EXE_POC_MEDIA).toHaveProperty('total');
  });

  it('monta el panel con el id histórico', () => {
    startProbe({ win: window, buildId: 'b1' });
    expect(document.getElementById('exe-poc-result')).toBeTruthy();
  });

  it('ofrece las tres pestañas y arranca en Resumen', () => {
    const panel = startProbe({ win: window, buildId: 'b1' });
    const tabs = panel.shadow.querySelectorAll('[role="tab"]');
    expect([...tabs].map((t) => t.textContent)).toEqual(['Resumen', 'Detalle', 'Demostración']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  });

  it('cambiar de pestaña actualiza aria-selected y el contenido', () => {
    const panel = startProbe({ win: window, buildId: 'b1' });
    const tabs = panel.shadow.querySelectorAll('[role="tab"]');
    tabs[2].click();
    expect(tabs[2].getAttribute('aria-selected')).toBe('true');
    expect(tabs[0].getAttribute('aria-selected')).toBe('false');
    expect(panel.shadow.querySelector('[data-revert-all]')).toBeTruthy();
  });

  it('no monta dos veces si se llama otra vez', () => {
    startProbe({ win: window, buildId: 'b1' });
    startProbe({ win: window, buildId: 'b1' });
    expect(document.querySelectorAll('#exe-poc-result')).toHaveLength(1);
  });

  it('cambiar el anfitrión en Demostración pinta solo la batería de ese anfitrión', () => {
    const panel = startProbe({ win: window, buildId: 'b1' });
    const tabs = panel.shadow.querySelectorAll('[role="tab"]');
    tabs[2].click(); // Demostración

    // Sin señales de anfitrión en el documento de prueba, detectHost cae en
    // 'generic' y la selección por defecto es el primer adaptador con demos
    // (moodle, ADAPTERS[0]).
    expect(panel.shadow.querySelector('[data-demo="moodle-own-user"]')).toBeTruthy();
    expect(panel.shadow.querySelector('[data-demo="wp-rename"]')).toBeNull();
    // La vitrina es independiente de la plataforma: siempre presente.
    expect(panel.shadow.querySelector('[data-demo="showcase-flip"]')).toBeTruthy();

    const select = panel.shadow.querySelector('select[data-host-select]');
    expect([...select.options].map((o) => o.value)).toEqual(
      ['moodle', 'wordpress', 'omeka', 'nextcloud'],
    );
    select.value = 'wordpress';
    select.dispatchEvent(new Event('change'));

    expect(panel.shadow.querySelector('[data-demo="wp-rename"]')).toBeTruthy();
    expect(panel.shadow.querySelector('[data-demo="moodle-own-user"]')).toBeNull();
    expect(panel.shadow.querySelector('[data-demo="showcase-flip"]')).toBeTruthy();
  });

  it('si el montaje del panel falla, deja el JSON visible en vez de quedarse mudo', () => {
    // Documento mínimo que revienta al construir nodos: el fallback debe escribir
    // en win.document, que sigue siendo el real.
    const roto = {
      getElementById: () => null,
      createElement: () => { throw new Error('sin DOM'); },
    };
    expect(() => startProbe({ win: window, buildId: 'b1', doc: roto })).not.toThrow();
    expect(document.body.textContent).toMatch(/canRunJavascript/);
  });

  it('ancla el panel dentro del bloque que envuelve su propio <script>, cuando se conoce', () => {
    const idevice = document.createElement('div');
    idevice.id = 'idevice-que-lleva-la-sonda';
    document.body.appendChild(idevice);
    const scriptEl = document.createElement('script');
    idevice.appendChild(scriptEl);

    const panel = startProbe({ win: window, buildId: 'b1', scriptEl });
    expect(panel.root.parentElement).toBe(idevice);
  });

  it('sin scriptEl, ancla en main o body como hasta ahora', () => {
    const panel = startProbe({ win: window, buildId: 'b1' });
    expect(document.body.contains(panel.root)).toBe(true);
  });

  it('un segundo intento fallido no duplica el <pre> de emergencia', () => {
    const roto = {
      getElementById: () => null,
      createElement: () => { throw new Error('sin DOM'); },
    };
    startProbe({ win: window, buildId: 'b1', doc: roto });
    startProbe({ win: window, buildId: 'b1', doc: roto });
    expect(document.querySelectorAll('#exe-poc-result')).toHaveLength(1);
  });
});

// La vista línea/completo: cada página del paquete decide con
// window.__EXE_POC_VIEW cuánto panel quiere. Section 1 pide 'completo'; el
// resto pide 'linea' — un resumen en el flujo con el mismo veredicto, sin
// pestañas, y sin implicar ninguna medida que el panel completo no haya
// hecho también. Ausente o con cualquier otro valor, se comporta como
// 'completo': nada que ya embeba el bundle sin fijar la variable cambia.
describe('startProbe — vista línea/completo', () => {
  afterEach(() => {
    delete window.__EXE_POC_VIEW;
  });

  it('sin __EXE_POC_VIEW, el valor por defecto es completo (tres pestañas)', () => {
    const panel = startProbe({ win: window, buildId: 'b1' });
    expect(panel.root.getAttribute('data-view')).toBe('completo');
    expect(panel.shadow.querySelectorAll('[role="tab"]')).toHaveLength(3);
  });

  it('con __EXE_POC_VIEW="completo", mantiene el panel con las tres pestañas', () => {
    window.__EXE_POC_VIEW = 'completo';
    const panel = startProbe({ win: window, buildId: 'b1' });
    expect(panel.root.getAttribute('data-view')).toBe('completo');
    expect(panel.shadow.querySelectorAll('[role="tab"]')).toHaveLength(3);
  });

  it('con __EXE_POC_VIEW="linea", monta un resumen compacto sin pestañas', () => {
    window.__EXE_POC_VIEW = 'linea';
    const panel = startProbe({ win: window, buildId: 'b1' });
    expect(panel.root.getAttribute('data-view')).toBe('linea');
    expect(panel.shadow.querySelectorAll('[role="tab"]')).toHaveLength(0);
  });

  it('la vista línea muestra el mismo veredicto (título y n/10) que calcularía la vista completa', () => {
    window.__EXE_POC_VIEW = 'linea';
    const panel = startProbe({ win: window, buildId: 'b1' });
    const verdict = computeVerdict(window.__EXE_POC_RESULT);
    const text = panel.shadow.textContent;
    expect(text).toContain(verdict.title);
    expect(text).toContain(verdict.score + ' de ' + verdict.total);
  });

  it('la vista línea apunta al apartado 1 para el detalle, sin repetir las diez comprobaciones', () => {
    window.__EXE_POC_VIEW = 'linea';
    const panel = startProbe({ win: window, buildId: 'b1' });
    const text = panel.shadow.textContent;
    expect(text).toMatch(/apartado 1/i);
    expect(text).toMatch(/Resultado de la medición/);
    expect(panel.shadow.querySelector('[data-check]')).toBeNull();
  });

  it('la vista línea no cambia el contrato congelado de __EXE_POC_RESULT', () => {
    window.__EXE_POC_VIEW = 'linea';
    startProbe({ win: window, buildId: 'b1' });
    expect(window.__EXE_POC_RESULT.parentCookieValue).toBe('REDACTED');
    expect(window.__EXE_POC_RESULT.canSubmitCourseEditForm).toBe('not_attempted');
  });

  it('un valor desconocido de __EXE_POC_VIEW se trata como completo', () => {
    window.__EXE_POC_VIEW = 'algo-que-no-existe';
    const panel = startProbe({ win: window, buildId: 'b1' });
    expect(panel.root.getAttribute('data-view')).toBe('completo');
    expect(panel.shadow.querySelectorAll('[role="tab"]')).toHaveLength(3);
  });
});

// Vista 'medicion' (apartado 1): contenido nativo en el propio HTML de la
// página, sin panel ni Shadow DOM — la corrección que pidió el equipo tras
// ver que el apartado 1 seguía flotando como el resto.
describe('startProbe — vista medicion (apartado 1, sin panel)', () => {
  afterEach(() => { delete window.__EXE_POC_VIEW; });

  function shell() {
    const wrap = document.createElement('div');
    wrap.setAttribute('data-exe-probe-medicion', '');
    const verdictBox = document.createElement('div');
    verdictBox.setAttribute('data-exe-probe-verdict', '');
    const title = document.createElement('p');
    title.setAttribute('data-exe-probe-verdict-title', '');
    verdictBox.appendChild(title);
    wrap.appendChild(verdictBox);
    const row = document.createElement('tr');
    row.setAttribute('data-exe-probe-row', 'canAccessParent');
    const valor = document.createElement('td');
    valor.setAttribute('data-exe-probe-valor', '');
    row.appendChild(valor);
    wrap.appendChild(row);
    document.body.appendChild(wrap);
    return wrap;
  }

  it('rellena el HTML nativo de la página, sin crear #exe-poc-result', () => {
    const wrap = shell();
    window.__EXE_POC_VIEW = 'medicion';
    const returned = startProbe({ win: window, buildId: 'b1' });
    expect(returned).toBe(null);
    expect(document.getElementById('exe-poc-result')).toBeNull();
    expect(wrap.querySelector('[data-exe-probe-verdict-title]').textContent).not.toBe('');
  });

  it('no monta el panel de pestañas en esta vista', () => {
    shell();
    window.__EXE_POC_VIEW = 'medicion';
    startProbe({ win: window, buildId: 'b1' });
    expect(document.querySelector('[role="tablist"]')).toBeNull();
    expect(document.querySelector('[data-view-linea]')).toBeNull();
  });

  it('sin el contenedor marcado en la página, no revienta y no monta nada', () => {
    window.__EXE_POC_VIEW = 'medicion';
    expect(() => startProbe({ win: window, buildId: 'b1' })).not.toThrow();
    expect(document.getElementById('exe-poc-result')).toBeNull();
  });

  it('publica __EXE_POC_RESULT igual que las demás vistas', () => {
    shell();
    window.__EXE_POC_VIEW = 'medicion';
    startProbe({ win: window, buildId: 'b1' });
    expect(window.__EXE_POC_RESULT).toBeTruthy();
  });

  it('llamar dos veces no reescribe la fila ya rellenada', () => {
    const wrap = shell();
    window.__EXE_POC_VIEW = 'medicion';
    startProbe({ win: window, buildId: 'b1' });
    const before = wrap.querySelector('[data-exe-probe-valor]').textContent;
    expect(() => startProbe({ win: window, buildId: 'b1' })).not.toThrow();
    expect(wrap.querySelector('[data-exe-probe-valor]').textContent).toBe(before);
  });
});

// Botones «Acciones disponibles» (5.1-5.4) y «Qué vería la persona usuaria»
// (6): exelib.py los marca con data-exe-probe-demo-host="<adaptador>" en el
// propio cuerpo de la página (fuera del panel). startProbe() debe encontrar
// ese contenedor y montar ahí, en luz, la misma batería que la pestaña
// Demostración monta en el Shadow DOM.
describe('startProbe — botones inline en el cuerpo de la página', () => {
  it('monta la batería del anfitrión marcado directamente en su contenedor', () => {
    const box = document.createElement('div');
    box.setAttribute('data-exe-probe-demo-host', 'moodle');
    document.body.appendChild(box);

    startProbe({ win: window, buildId: 'b1' });

    expect(box.querySelector('button[data-demo="moodle-own-user"]')).toBeTruthy();
    expect(box.querySelector('button[data-demo="wp-rename"]')).toBeNull();
  });

  it('host="showcase" monta la vitrina de impacto', () => {
    const box = document.createElement('div');
    box.setAttribute('data-exe-probe-demo-host', 'showcase');
    document.body.appendChild(box);

    startProbe({ win: window, buildId: 'b1' });

    expect(box.querySelector('button[data-demo="showcase-flip"]')).toBeTruthy();
  });

  it('monta un contenedor por cada anfitrión marcado en la página', () => {
    const moodleBox = document.createElement('div');
    moodleBox.setAttribute('data-exe-probe-demo-host', 'moodle');
    const wpBox = document.createElement('div');
    wpBox.setAttribute('data-exe-probe-demo-host', 'wordpress');
    document.body.append(moodleBox, wpBox);

    startProbe({ win: window, buildId: 'b1' });

    expect(moodleBox.querySelector('button[data-demo="moodle-own-user"]')).toBeTruthy();
    expect(wpBox.querySelector('button[data-demo="wp-rename"]')).toBeTruthy();
  });

  it('pulsar un botón inline se clasifica con el mismo chip de tres estados', async () => {
    const box = document.createElement('div');
    box.setAttribute('data-exe-probe-demo-host', 'showcase');
    document.body.appendChild(box);

    startProbe({ win: window, buildId: 'b1' });

    box.querySelector('button[data-demo="showcase-flip"]').click();
    await new Promise((r) => setTimeout(r, 0));
    expect(box.querySelector('[data-chip="showcase-flip"]').textContent).toMatch(/BLOQUEADO|ESCAPE/);
  });

  it('llamar a startProbe() dos veces no duplica los botones inline', () => {
    const box = document.createElement('div');
    box.setAttribute('data-exe-probe-demo-host', 'moodle');
    document.body.appendChild(box);

    startProbe({ win: window, buildId: 'b1' });
    startProbe({ win: window, buildId: 'b1' });

    expect(box.querySelectorAll('button[data-demo="moodle-own-user"]')).toHaveLength(1);
  });

  it('sin marcador en la página, no monta nada inline ni rompe el arranque', () => {
    expect(() => startProbe({ win: window, buildId: 'b1' })).not.toThrow();
    expect(document.querySelector('[data-exe-probe-demo-host-mounted]')).toBeNull();
  });

  it('un documento sin querySelectorAll (fallback roto) no revienta el montaje inline', () => {
    const roto = {
      getElementById: () => null,
      createElement: () => { throw new Error('sin DOM'); },
    };
    expect(() => startProbe({ win: window, buildId: 'b1', doc: roto })).not.toThrow();
  });
});
