import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createShowcase } from '../src/hosts/showcase.js';
import { createContext } from '../src/hosts/contract.js';

let ctx;

const LOGO_ORIGINAL_SRC = 'https://cdn.ejemplo.org/logo-original.png';

function hostCtx() {
  const doc = document.implementation.createHTMLDocument('anfitrión');
  doc.body.innerHTML =
    '<header><img id="logo-institucion" src="' + LOGO_ORIGINAL_SRC + '" alt="Logo"></header>' +
    '<h1>Curso de ejemplo</h1>';
  const parent = { document: doc, location: { href: 'http://localhost/' } };
  const win = { parent, origin: 'http://localhost' };
  win.parent.parent = parent;
  return createContext({ win, journal: null, buildId: 'b1' });
}

// Igual que hostCtx, pero sin ninguna imagen en el documento del anfitrión:
// prueba la rama de "no hay logotipo que sustituir" de la demo showcase-logo.
function hostCtxSinImagenes() {
  const doc = document.implementation.createHTMLDocument('anfitrión');
  doc.body.innerHTML = '<h1>Curso de ejemplo</h1>';
  const parent = { document: doc, location: { href: 'http://localhost/' } };
  const win = { parent, origin: 'http://localhost' };
  win.parent.parent = parent;
  return createContext({ win, journal: null, buildId: 'b1' });
}

// Igual que hostCtx, pero con requestAnimationFrame/cancelAnimationFrame en el
// win: la sonda jsdom de createHTMLDocument no los tiene, así que sin esto la
// rama de la lluvia de dígitos de la terminal nunca se ejecuta bajo test.
function hostCtxConRaf() {
  const doc = document.implementation.createHTMLDocument('anfitrión');
  doc.body.innerHTML = '<h1>Curso de ejemplo</h1>';
  const parent = { document: doc, location: { href: 'http://localhost/' } };
  let nextId = 0;
  const win = {
    parent,
    origin: 'http://localhost',
    requestAnimationFrame: vi.fn(() => { nextId += 1; return nextId; }),
    cancelAnimationFrame: vi.fn(),
  };
  win.parent.parent = parent;
  return { ctx: createContext({ win, journal: null, buildId: 'b1' }), win };
}

function pwnedBanner(layer) {
  return layer.querySelector('[data-exe-showcase-pwned]')
    || Array.from(layer.querySelectorAll('div')).find((d) => d.textContent === 'PWNED');
}

/** Avanza la secuencia de hacking hasta el banner PWNED (ticks + pausa final). */
function advanceTerminalToPwned() {
  // 9 pasos × 480 ms + 450 ms de revelación ≈ 4,8 s
  vi.advanceTimersByTime(5000);
}

beforeEach(() => { vi.useFakeTimers(); ctx = hostCtx(); });
afterEach(() => { vi.useRealTimers(); });

const run = (demo) => new Promise((res) => demo.run(ctx, null, res));

describe('vitrina de impacto', () => {
  const sc = () => createShowcase({ buildId: 'b1', timeoutMs: 60000 });

  it('declara las cinco demos y ninguna escribe en el anfitrión', () => {
    expect(sc().demos.map((d) => d.id)).toEqual([
      'showcase-flip', 'showcase-terminal', 'showcase-login',
      'showcase-logo', 'showcase-notice',
    ]);
    expect(sc().demos.every((d) => d.persists === false)).toBe(true);
  });

  it('cada demo documenta qué intenta, de qué protege y cómo se revierte', () => {
    for (const d of sc().demos) {
      expect(d.help.intenta.length).toBeGreaterThan(10);
      expect(d.help.protege.length).toBeGreaterThan(10);
      expect(d.help.reversion.length).toBeGreaterThan(5);
    }
  });

  it('voltear aplica el espejo al body del anfitrión', async () => {
    const s = sc();
    await run(s.demos[0]);
    expect(ctx.parentDoc().body.style.transform).toMatch(/scaleX\(-1\)/);
  });

  it('la terminal inserta una capa con PWNED y panel de intrusión', async () => {
    const s = sc();
    await run(s.demos[1]);
    const layer = ctx.parentDoc().querySelector('[data-exe-showcase="terminal"]');
    expect(layer).not.toBe(null);
    expect(layer.querySelector('[data-exe-showcase-pwned]')).not.toBe(null);
    expect(layer.querySelector('[data-exe-showcase-hack]')).not.toBe(null);
    expect(layer.querySelector('[data-exe-showcase-bar]')).not.toBe(null);
    expect(layer.querySelector('[data-exe-showcase-log]')).not.toBe(null);
    expect(layer.textContent).toMatch(/PWNED/);
  });

  it('el login falso usa un servicio inventado, nunca una marca real', async () => {
    const s = sc();
    await run(s.demos[2]);
    const layer = ctx.parentDoc().querySelector('[data-exe-showcase="login"]');
    expect(layer.textContent).toMatch(/CorreoNube 98/);
    expect(layer.textContent).not.toMatch(/hotmail|gmail|outlook|office ?365/i);
  });

  it('los campos del login son decorativos y el formulario no tiene envío', async () => {
    const s = sc();
    await run(s.demos[2]);
    const layer = ctx.parentDoc().querySelector('[data-exe-showcase="login"]');
    for (const input of layer.querySelectorAll('input')) {
      expect(input.hasAttribute('readonly')).toBe(true);
    }
    expect(layer.querySelector('form').getAttribute('onsubmit')).toBe(null);
  });

  it('al primer foco el login revela que es una demostración', async () => {
    const s = sc();
    await run(s.demos[2]);
    const layer = ctx.parentDoc().querySelector('[data-exe-showcase="login"]');
    const aviso = layer.querySelector('[data-exe-showcase-reveal]');
    expect(aviso.hidden).toBe(true);
    // El documento del padre se crea con createHTMLDocument, cuyo defaultView es
    // null: el constructor Event se toma del entorno global de la prueba.
    layer.querySelector('input').dispatchEvent(new Event('focus'));
    expect(aviso.hidden).toBe(false);
    expect(aviso.textContent).toMatch(/no se ha capturado nada/i);
  });

  it('terminal y login llevan la marca de demostración con el buildId', async () => {
    const s = sc();
    await run(s.demos[1]);
    await run(s.demos[2]);
    const marks = ctx.parentDoc().querySelectorAll('[data-exe-showcase-mark]');
    expect(marks.length).toBe(2);
    expect(marks[0].textContent).toMatch(/DEMOSTRACIÓN/);
    expect(marks[0].textContent).toMatch(/b1/);
  });

  it('el logotipo sustituye la imagen de cabecera del anfitrión y lleva la franja de demostración', async () => {
    const s = sc();
    await run(s.demos[3]);
    const layer = ctx.parentDoc().querySelector('[data-exe-showcase="logo"]');
    expect(layer).not.toBe(null);
    expect(layer.querySelector('[data-exe-showcase-mark]').textContent).toMatch(/DEMOSTRACIÓN/);
    const img = ctx.parentDoc().querySelector('#logo-institucion');
    expect(img.getAttribute('src')).not.toBe(LOGO_ORIGINAL_SRC);
  });

  it('sin ninguna imagen en el anfitrión, el logotipo no monta capa y lo informa', async () => {
    const blindCtx = hostCtxSinImagenes();
    const s = sc();
    const raw = await new Promise((res) => s.demos[3].run(blindCtx, null, res));
    expect(String(raw)).toMatch(/^OK/);
    expect(blindCtx.parentDoc().querySelector('[data-exe-showcase="logo"]')).toBe(null);
  });

  it('el aviso de mantenimiento se superpone sin nombrar ninguna marca real', async () => {
    const s = sc();
    await run(s.demos[4]);
    const layer = ctx.parentDoc().querySelector('[data-exe-showcase="notice"]');
    expect(layer).not.toBe(null);
    expect(layer.querySelector('[data-exe-showcase-mark]').textContent).toMatch(/DEMOSTRACIÓN/);
    expect(layer.querySelector('[data-exe-showcase-notice-page]')).not.toBe(null);
    expect(layer.querySelector('[data-exe-showcase-notice-bar]')).not.toBe(null);
    const msg = layer.querySelector('[data-exe-showcase-notice-msg]');
    expect(msg.textContent.length).toBeGreaterThan(10);
    expect(msg.textContent).not.toMatch(/moodle|wordpress|omeka|nextcloud|exelearning|google|microsoft|github|cloudflare/i);
    expect(layer.textContent).toMatch(/Volvemos enseguida|mantenimiento/i);
  });

  it('el aviso de mantenimiento avanza la barra y detiene el intervalo al quitar', async () => {
    const s = sc();
    await run(s.demos[4]);
    const layer = ctx.parentDoc().querySelector('[data-exe-showcase="notice"]');
    const bar = layer.querySelector('[data-exe-showcase-notice-bar]');
    const before = bar.style.width;
    vi.advanceTimersByTime(2000);
    expect(bar.style.width).not.toBe(before);
    layer.querySelector('button').dispatchEvent(new Event('click'));
    expect(ctx.parentDoc().querySelector('[data-exe-showcase="notice"]')).toBe(null);
  });

  it('restoreAll deja el DOM del anfitrión como estaba, incluido el logotipo original', async () => {
    const before = ctx.parentDoc().body.innerHTML;
    const s = sc();
    await run(s.demos[0]);
    await run(s.demos[1]);
    await run(s.demos[2]);
    await run(s.demos[3]);
    await run(s.demos[4]);
    const img = ctx.parentDoc().querySelector('#logo-institucion');
    expect(img.getAttribute('src')).not.toBe(LOGO_ORIGINAL_SRC);
    s.restoreAll(ctx);
    expect(ctx.parentDoc().body.innerHTML).toBe(before);
    expect(ctx.parentDoc().body.style.transform).toBe('');
    expect(ctx.parentDoc().querySelector('#logo-institucion').getAttribute('src')).toBe(LOGO_ORIGINAL_SRC);
  });

  it('cada capa se retira sola al vencer el plazo', async () => {
    const s = createShowcase({ buildId: 'b1', timeoutMs: 1000 });
    await run(s.demos[1]);
    expect(ctx.parentDoc().querySelector('[data-exe-showcase="terminal"]')).not.toBe(null);
    vi.advanceTimersByTime(1001);
    expect(ctx.parentDoc().querySelector('[data-exe-showcase="terminal"]')).toBe(null);
  });

  it('el logotipo se restaura solo al vencer el plazo', async () => {
    const s = createShowcase({ buildId: 'b1', timeoutMs: 1000 });
    await run(s.demos[3]);
    expect(ctx.parentDoc().querySelector('#logo-institucion').getAttribute('src')).not.toBe(LOGO_ORIGINAL_SRC);
    vi.advanceTimersByTime(1001);
    expect(ctx.parentDoc().querySelector('[data-exe-showcase="logo"]')).toBe(null);
    expect(ctx.parentDoc().querySelector('#logo-institucion').getAttribute('src')).toBe(LOGO_ORIGINAL_SRC);
  });

  it('el aviso de mantenimiento se retira solo al vencer el plazo', async () => {
    const s = createShowcase({ buildId: 'b1', timeoutMs: 1000 });
    await run(s.demos[4]);
    expect(ctx.parentDoc().querySelector('[data-exe-showcase="notice"]')).not.toBe(null);
    vi.advanceTimersByTime(1001);
    expect(ctx.parentDoc().querySelector('[data-exe-showcase="notice"]')).toBe(null);
  });

  it('el botón Quitar del logotipo restaura el src original de inmediato, sin esperar al plazo', async () => {
    const s = sc();
    await run(s.demos[3]);
    const layer = ctx.parentDoc().querySelector('[data-exe-showcase="logo"]');
    layer.querySelector('button').dispatchEvent(new Event('click'));
    expect(ctx.parentDoc().querySelector('[data-exe-showcase="logo"]')).toBe(null);
    expect(ctx.parentDoc().querySelector('#logo-institucion').getAttribute('src')).toBe(LOGO_ORIGINAL_SRC);
    // Tras Quitar, el temporizador de 60 s no debe volver a tocar nada.
    vi.advanceTimersByTime(60001);
    expect(ctx.parentDoc().querySelector('#logo-institucion').getAttribute('src')).toBe(LOGO_ORIGINAL_SRC);
  });

  it('el botón Quitar del aviso lo retira de inmediato, sin esperar al plazo', async () => {
    const s = sc();
    await run(s.demos[4]);
    const layer = ctx.parentDoc().querySelector('[data-exe-showcase="notice"]');
    layer.querySelector('button').dispatchEvent(new Event('click'));
    expect(ctx.parentDoc().querySelector('[data-exe-showcase="notice"]')).toBe(null);
  });

  it('bajo origen opaco las cinco devuelven BLOQUEADO', async () => {
    const blind = createContext({
      win: { get parent() { throw new DOMException('no', 'SecurityError'); }, origin: 'null' },
      journal: null, buildId: 'b1',
    });
    const s = sc();
    for (const demo of s.demos) {
      const raw = await new Promise((res) => demo.run(blind, null, res));
      expect(String(raw)).toMatch(/^BLOQUEADO/);
    }
  });

  // Regresión: el escenario real que reportó el usuario. Al abrir el
  // artefacto fuera de cualquier LMS/CMS (por ejemplo sirviéndolo suelto),
  // el documento se ejecuta como top-level de verdad: win.parent === win.
  // Con el bug de parentDoc() (hallazgo del Fix 5 de la tarea 23), blocked()
  // creía tener un padre alcanzable y las demos pintaban sobre la
  // propia página en vez de reportar BLOQUEADO.
  it('en top-level de verdad (win.parent === win), las cinco devuelven BLOQUEADO y no tocan el documento', async () => {
    const doc = document.implementation.createHTMLDocument('recurso suelto');
    doc.body.innerHTML = '<h1>Recurso suelto</h1>';
    const before = doc.body.innerHTML;
    const win = { document: doc, origin: 'http://localhost' };
    win.parent = win; // sin ningún iframe por encima
    const topLevelCtx = createContext({ win, journal: null, buildId: 'b1' });
    const s = sc();
    for (const demo of s.demos) {
      const raw = await new Promise((res) => demo.run(topLevelCtx, null, res));
      expect(String(raw)).toMatch(/^BLOQUEADO/);
    }
    expect(doc.body.innerHTML).toBe(before);
    expect(doc.body.style.transform).toBe('');
  });

  it('no hace red ni toca el almacenamiento', async () => {
    const fetchSpy = vi.fn();
    ctx.win.fetch = fetchSpy;
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const s = sc();
    for (const demo of s.demos) await run(demo);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('el volteo se revierte solo al vencer el plazo', async () => {
    const s = sc();
    await run(s.demos[0]);
    expect(ctx.parentDoc().body.style.transform).toMatch(/scaleX\(-1\)/);
    vi.advanceTimersByTime(60001);
    expect(ctx.parentDoc().body.style.transform).toBe('');
  });

  it('el volteo cancela el temporizador pendiente si se desactiva antes de tiempo', async () => {
    // revert() es idempotente (deja transform en '' se ejecute una vez o dos),
    // así que solo mirar el transform final no distingue "se canceló el
    // temporizador" de "el temporizador disparó de todas formas sin efecto
    // visible". Se espía setTimeout/clearTimeout para observar la cancelación
    // en sí misma, con el id exacto que programó el volteo.
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const s = sc();
    await run(s.demos[0]); // lo activa y programa la reversión automática
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    const flipTimerId = setTimeoutSpy.mock.results[0].value;

    await run(s.demos[0]); // lo desactiva a mano antes de que venza el plazo
    expect(clearTimeoutSpy).toHaveBeenCalledWith(flipTimerId);

    expect(ctx.parentDoc().body.style.transform).toBe('');
    vi.advanceTimersByTime(60001);
    expect(ctx.parentDoc().body.style.transform).toBe('');

    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  });

  it('el botón Quitar de la terminal detiene el intervalo y la animación', async () => {
    const { ctx: rafCtx, win } = hostCtxConRaf();
    const s = sc();
    await new Promise((res) => s.demos[1].run(rafCtx, null, res));
    const layer = rafCtx.parentDoc().querySelector('[data-exe-showcase="terminal"]');
    advanceTerminalToPwned();
    const banner = pwnedBanner(layer);
    expect(banner).not.toBe(null);
    expect(banner.textContent).toMatch(/PWNED|ACCESO CONCEDIDO/);
    expect(win.requestAnimationFrame).toHaveBeenCalled();

    layer.querySelector('button').dispatchEvent(new Event('click'));
    expect(win.cancelAnimationFrame).toHaveBeenCalled();

    const textoTrasQuitar = banner.textContent;
    vi.advanceTimersByTime(700); // más de un ciclo del parpadeo (600 ms)
    expect(banner.textContent).toBe(textoTrasQuitar);
  });

  it('la terminal detiene el intervalo y la animación al agotarse el plazo', async () => {
    const { ctx: rafCtx, win } = hostCtxConRaf();
    // Plazo suficiente para completar la secuencia y arrancar el parpadeo.
    const s = createShowcase({ buildId: 'b1', timeoutMs: 6000 });
    await new Promise((res) => s.demos[1].run(rafCtx, null, res));
    const layer = rafCtx.parentDoc().querySelector('[data-exe-showcase="terminal"]');
    advanceTerminalToPwned();
    const banner = pwnedBanner(layer);
    expect(banner).not.toBe(null);

    vi.advanceTimersByTime(6001);
    expect(win.cancelAnimationFrame).toHaveBeenCalled();
    expect(rafCtx.parentDoc().querySelector('[data-exe-showcase="terminal"]')).toBe(null);

    const textoTrasExpirar = banner.textContent;
    vi.advanceTimersByTime(700); // más de un ciclo del parpadeo tras el plazo
    expect(banner.textContent).toBe(textoTrasExpirar);
  });

  it('la secuencia de hacking avanza la barra y termina en PWNED', async () => {
    const s = sc();
    await run(s.demos[1]);
    const layer = ctx.parentDoc().querySelector('[data-exe-showcase="terminal"]');
    const bar = layer.querySelector('[data-exe-showcase-bar]');
    const pct = layer.querySelector('[data-exe-showcase-pct]');
    const log = layer.querySelector('[data-exe-showcase-log]');
    expect(pct.textContent).toMatch(/^\d+%/);
    expect(log.textContent.length).toBeGreaterThan(0);

    advanceTerminalToPwned();
    expect(bar.style.width).toBe('100%');
    expect(pct.textContent).toBe('100%');
    const banner = pwnedBanner(layer);
    expect(banner.style.display).toBe('grid');
    expect(banner.textContent).toMatch(/PWNED|ACCESO CONCEDIDO/);
  });
});
