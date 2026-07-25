import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderDemos } from '../src/ui/demos-view.js';
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
    const { wrap, s } = mount();
    const select = wrap.querySelector('select[data-host-select]');
    expect(select.options.length).toBeGreaterThanOrEqual(1);
    select.value = 'moodle';
    select.dispatchEvent(new Event('change'));
    expect(s.onSelectHost).toHaveBeenCalledWith('moodle');
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
