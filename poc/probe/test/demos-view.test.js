import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderDemos, mountInlineDemos } from '../src/ui/demos-view.js';
import { createJournal } from '../src/core/journal.js';

const demo = (id, raw) => ({
  id, label: 'Demo ' + id, icon: '⚙', persists: true,
  help: { intenta: 'intenta algo medible', protege: 'protege de algo concreto', reversion: 'reversible', doc: 'matriz-seguridad.md' },
  run: (ctx, journal, cb) => cb(raw),
});

function scene(over) {
  const journal = createJournal({ buildId: 'b', storage: null });
  return Object.assign({
    doc: document,
    ctx: { win: {}, parentDoc: () => document },
    adapters: [{ id: 'moodle', label: 'Moodle', demos: [demo('d-esc', JSON.stringify({ created: true }))] }],
    showcase: { id: 'showcase', label: 'Vitrina de impacto', demos: [demo('s-flip', 'OK: volteado')], restoreAll: vi.fn() },
    journal,
    isOpaqueOrigin: false,
    selectedHostId: 'moodle',
    onSelectHost: vi.fn(),
  }, over || {});
}

function mount(over) {
  const s = scene(over);
  const wrap = document.createElement('div');
  wrap.appendChild(renderDemos(s));
  document.body.appendChild(wrap);
  return { wrap, s };
}

beforeEach(() => { document.body.innerHTML = ''; });

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('renderDemos', () => {
  it('agrupa las demos por anfitrión y añade la vitrina', () => {
    const { wrap } = mount();
    expect(wrap.textContent).toMatch(/Moodle/);
    expect(wrap.textContent).toMatch(/Vitrina de impacto/);
    expect(wrap.querySelectorAll('button[data-demo]')).toHaveLength(2);
  });

  it('cada demo arranca en el estado sin ejecutar', () => {
    const { wrap } = mount();
    expect(wrap.querySelector('[data-chip]').textContent).toMatch(/sin ejecutar/);
  });

  it('cada demo trae su ⓘ plegada', () => {
    const { wrap } = mount();
    expect(wrap.querySelector('[data-help]').hidden).toBe(true);
  });

  // Tarjeta de acción (maqueta de diseño, diseno-maqueta.html:288-309): título
  // y descripción a la izquierda, el botón siempre dice «Ejecutar» — ya no
  // repite el nombre de la demo — y la petición/respuesta permanecen ocultas
  // hasta que se ejecuta.
  it('el botón siempre dice «Ejecutar»; el título y la descripción van aparte', () => {
    const { wrap } = mount();
    const button = wrap.querySelector('button[data-demo="d-esc"]');
    expect(button.textContent).toBe('Ejecutar');
    expect(wrap.textContent).toMatch(/Demo d-esc/);
    expect(wrap.textContent).toMatch(/intenta algo medible/);
  });

  it('la petición y la respuesta están ocultas antes de ejecutar', () => {
    const { wrap } = mount();
    const raw = wrap.querySelector('[data-raw="d-esc"]');
    expect(raw.closest('div').hidden).toBe(true);
  });

  it('tras ejecutar, muestra la línea de petición cuando la demo la declara', async () => {
    const conRequest = Object.assign(demo('d-req', 'OK'), { request: 'POST /ejemplo' });
    const { wrap } = mount({ adapters: [{ id: 'moodle', label: 'Moodle', demos: [conRequest] }] });
    wrap.querySelector('button[data-demo="d-req"]').click();
    await tick();
    expect(wrap.querySelector('[data-raw="d-req"]').closest('div').hidden).toBe(false);
    expect(wrap.textContent).toMatch(/POST \/ejemplo/);
  });

  it('sin `request` (la vitrina no hace red), no inventa una línea de petición', async () => {
    const { wrap } = mount();
    wrap.querySelector('button[data-demo="s-flip"]').click();
    await tick();
    const resultWrap = wrap.querySelector('[data-raw="s-flip"]').closest('div');
    // La única línea de texto dentro del contenedor de resultado es el <pre>
    // mismo: ningún <p> de petición se ha añadido.
    expect(resultWrap.querySelectorAll('p')).toHaveLength(0);
  });

  it('al pulsar, la demo que escribe pinta el chip de ESCAPE', async () => {
    const { wrap } = mount();
    wrap.querySelector('button[data-demo="d-esc"]').click();
    await tick();
    expect(wrap.querySelector('[data-chip="d-esc"]').textContent).toMatch(/ESCAPE/);
  });

  it('bajo origen opaco el mismo retorno se lee como BLOQUEADO', async () => {
    const { wrap } = mount({
      isOpaqueOrigin: true,
      adapters: [{ id: 'moodle', label: 'Moodle', demos: [demo('d-blq', 'BLOQUEADO (origen opaco)')] }],
    });
    wrap.querySelector('button[data-demo="d-blq"]').click();
    await tick();
    expect(wrap.querySelector('[data-chip="d-blq"]').textContent).toMatch(/BLOQUEADO/);
  });

  it('un retorno sin completar se marca INDETERMINADO, nunca como contención', async () => {
    const { wrap } = mount({
      adapters: [{ id: 'moodle', label: 'Moodle', demos: [demo('d-ind', JSON.stringify({ renamed: false }))] }],
    });
    wrap.querySelector('button[data-demo="d-ind"]').click();
    await tick();
    const chip = wrap.querySelector('[data-chip="d-ind"]');
    expect(chip.textContent).toMatch(/INDETERMINADO/);
    expect(chip.textContent).not.toMatch(/BLOQUEADO/);
  });

  it('publica el último resultado en window.__EXE_POC_LAST_DEMO', async () => {
    const { wrap } = mount();
    wrap.querySelector('button[data-demo="d-esc"]').click();
    await tick();
    expect(window.__EXE_POC_LAST_DEMO.id).toBe('d-esc');
    expect(window.__EXE_POC_LAST_DEMO.state).toBe('escaped');
  });

  it('conserva el retorno crudo bajo el chip', async () => {
    const { wrap } = mount();
    wrap.querySelector('button[data-demo="d-esc"]').click();
    await tick();
    expect(wrap.querySelector('[data-raw="d-esc"]').textContent).toMatch(/created/);
  });

  it('una demo que lanza se clasifica sin romper el panel', async () => {
    const explosiva = Object.assign(demo('d-boom'), {
      run: () => { throw new DOMException('no', 'SecurityError'); },
    });
    const { wrap } = mount({ adapters: [{ id: 'moodle', label: 'Moodle', demos: [explosiva] }] });
    expect(() => wrap.querySelector('button[data-demo="d-boom"]').click()).not.toThrow();
    await tick();
    expect(wrap.querySelector('[data-chip="d-boom"]').textContent).toMatch(/BLOQUEADO/);
  });

  it('el selector de anfitrión lista los adaptadores y avisa del cambio', () => {
    const { wrap, s } = mount({
      adapters: [
        { id: 'moodle', label: 'Moodle', demos: [demo('d-esc', JSON.stringify({ created: true }))] },
        { id: 'wordpress', label: 'WordPress', demos: [demo('d-wp', JSON.stringify({ created: true }))] },
      ],
    });
    const select = wrap.querySelector('select[data-host-select]');
    const options = Array.from(select.options);
    expect(options.map((o) => o.value)).toEqual(['moodle', 'wordpress']);
    expect(options.map((o) => o.textContent)).toEqual(['Moodle', 'WordPress']);
    select.value = 'moodle';
    select.dispatchEvent(new Event('change'));
    expect(s.onSelectHost).toHaveBeenCalledWith('moodle');
  });

  it('con hostsForSelect, el desplegable lista esos anfitriones aunque adapters traiga solo uno', () => {
    const { wrap, s } = mount({
      adapters: [{ id: 'moodle', label: 'Moodle', demos: [demo('d-esc', JSON.stringify({ created: true }))] }],
      hostsForSelect: [
        { id: 'moodle', label: 'Moodle' },
        { id: 'wordpress', label: 'WordPress' },
        { id: 'omeka', label: 'Omeka S' },
      ],
      selectedHostId: 'moodle',
    });
    const select = wrap.querySelector('select[data-host-select]');
    const options = Array.from(select.options);
    expect(options.map((o) => o.value)).toEqual(['moodle', 'wordpress', 'omeka']);
    expect(options.map((o) => o.textContent)).toEqual(['Moodle', 'WordPress', 'Omeka S']);
    // Los bloques de demo salen de `adapters`, no de `hostsForSelect`: solo
    // moodle (que trae una) más la vitrina (que trae otra).
    expect(wrap.querySelectorAll('button[data-demo]')).toHaveLength(2);
    expect(wrap.querySelector('button[data-demo="d-esc"]')).not.toBeNull();
    select.value = 'wordpress';
    select.dispatchEvent(new Event('change'));
    expect(s.onSelectHost).toHaveBeenCalledWith('wordpress');
  });

  it('sin hostsForSelect, el desplegable se sigue derivando de adapters', () => {
    const { wrap } = mount({
      adapters: [{ id: 'moodle', label: 'Moodle', demos: [demo('d-esc', 'OK')] }],
    });
    const select = wrap.querySelector('select[data-host-select]');
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['moodle']);
  });

  it('agrupa un botón por cada demo de cada anfitrión listado', () => {
    const { wrap } = mount({
      adapters: [
        { id: 'moodle', label: 'Moodle', demos: [demo('d-a', 'OK'), demo('d-b', 'OK')] },
        { id: 'wordpress', label: 'WordPress', demos: [demo('d-c', 'OK')] },
      ],
    });
    expect(wrap.querySelector('button[data-demo="d-a"]')).not.toBeNull();
    expect(wrap.querySelector('button[data-demo="d-b"]')).not.toBeNull();
    expect(wrap.querySelector('button[data-demo="d-c"]')).not.toBeNull();
  });

  it('Revertir todo muestra el saldo del diario', async () => {
    const { wrap, s } = mount();
    s.journal.record({ host: 'moodle', kind: 'course', label: 'c', id: '1', undo: () => {} });
    s.journal.record({ host: 'moodle', kind: 'user', label: 'u', id: '2' });
    wrap.querySelector('[data-revert-all]').click();
    await tick();
    const saldo = wrap.querySelector('[data-journal-summary]').textContent;
    expect(saldo).toMatch(/1 revertida/);
    expect(saldo).toMatch(/1 no reversible/);
  });

  it('Restaurar vitrina llama a restoreAll', () => {
    const { wrap, s } = mount();
    wrap.querySelector('[data-restore-showcase]').click();
    expect(s.showcase.restoreAll).toHaveBeenCalled();
  });

  it('advierte de que las acciones son reales antes de la lista', () => {
    const { wrap } = mount();
    expect(wrap.textContent).toMatch(/acciones reales/i);
    expect(wrap.textContent).toMatch(/autorizad/i);
  });
});

// mountInlineDemos: los botones «Acciones disponibles» (5.1-5.4) y «Qué
// vería la persona usuaria» (6) viven en el cuerpo de la página, no dentro
// del panel — pero deben comportarse exactamente igual: mismo demoBlock(),
// mismo demo.run(), mismos chips de tres estados.
describe('mountInlineDemos', () => {
  it('monta un botón por demo directamente en el contenedor dado', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const journal = createJournal({ buildId: 'b', storage: null });
    mountInlineDemos(document, container, [demo('d-a', 'OK'), demo('d-b', 'OK')], {
      doc: document, ctx: { win: {}, parentDoc: () => document }, journal, isOpaqueOrigin: false,
    });
    expect(container.querySelectorAll('button[data-demo]')).toHaveLength(2);
  });

  it('al pulsar, clasifica el resultado con el mismo chip de tres estados que el panel', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const journal = createJournal({ buildId: 'b', storage: null });
    mountInlineDemos(document, container, [demo('d-esc', JSON.stringify({ created: true }))], {
      doc: document, ctx: { win: {}, parentDoc: () => document }, journal, isOpaqueOrigin: false,
    });
    container.querySelector('button[data-demo="d-esc"]').click();
    await tick();
    expect(container.querySelector('[data-chip="d-esc"]').textContent).toMatch(/ESCAPE/);
  });

  it('bajo origen opaco, el mismo botón inline devuelve BLOQUEADO', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const journal = createJournal({ buildId: 'b', storage: null });
    mountInlineDemos(document, container, [demo('d-blq', 'BLOQUEADO (origen opaco)')], {
      doc: document, ctx: { win: {}, parentDoc: () => document }, journal, isOpaqueOrigin: true,
    });
    container.querySelector('button[data-demo="d-blq"]').click();
    await tick();
    expect(container.querySelector('[data-chip="d-blq"]').textContent).toMatch(/BLOQUEADO/);
  });

  it('no depende del Shadow DOM: funciona en un contenedor de luz cualquiera', () => {
    const container = document.createElement('div');
    // Deliberadamente NO adjunto a document.body: solo un contenedor suelto,
    // como sería el <div> de un iDevice de texto antes de que eXeLearning lo
    // inserte en la página.
    mountInlineDemos(document, container, [demo('d-a', 'OK')], {
      doc: document, ctx: { win: {}, parentDoc: () => document },
      journal: createJournal({ buildId: 'b', storage: null }), isOpaqueOrigin: false,
    });
    expect(container.querySelector('button[data-demo="d-a"]')).not.toBeNull();
  });
});
