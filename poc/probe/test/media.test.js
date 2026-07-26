import { describe, it, expect, beforeEach } from 'vitest';
import { measureMedia, CLAIM_TEXT } from '../src/core/media.js';

// jsdom da 0x0 a todo; se fuerza la caja elemento a elemento.
function withBox(el, w, h) {
  el.getBoundingClientRect = () => ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h });
  return el;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('measureMedia', () => {
  it('sin elementos marcados devuelve un total de cero', () => {
    expect(measureMedia(document).total).toBe(0);
  });

  it('un iframe cross-origin con caja se declara no bloqueado, no cargado', () => {
    const el = document.createElement('iframe');
    el.setAttribute('data-exe-probe-media', 'iframe');
    el.setAttribute('data-exe-probe-label', 'YouTube');
    el.src = 'https://www.youtube-nocookie.com/embed/x';
    document.body.appendChild(withBox(el, 640, 360));

    const r = measureMedia(document);
    expect(r.total).toBe(1);
    expect(r.ok).toBe(1);
    expect(r.items[0].claim).toBe('frame-no-bloqueado');
    expect(r.items[0].status).toBe('ok');
    expect(CLAIM_TEXT['frame-no-bloqueado']).toMatch(/no bloqueó/i);
  });

  it('un iframe sin caja se declara bloqueado', () => {
    const el = document.createElement('iframe');
    el.setAttribute('data-exe-probe-media', 'iframe');
    el.setAttribute('data-exe-probe-label', 'Vimeo');
    document.body.appendChild(withBox(el, 0, 0));
    const r = measureMedia(document);
    expect(r.items[0].status).toBe('blocked');
    expect(r.blocked).toBe(1);
  });

  it('un iframe sustituido por el placeholder del shim se declara bloqueado', () => {
    const el = document.createElement('iframe');
    el.setAttribute('data-exe-probe-media', 'iframe');
    el.setAttribute('data-exe-probe-label', 'genérico');
    el.setAttribute('data-exe-shim-placeholder', '');
    document.body.appendChild(withBox(el, 640, 360));
    expect(measureMedia(document).items[0].status).toBe('blocked');
  });

  it('una imagen del paquete que carga se declara carga real', () => {
    const el = document.createElement('img');
    el.setAttribute('data-exe-probe-media', 'image');
    el.setAttribute('data-exe-probe-label', 'logo del paquete');
    Object.defineProperty(el, 'naturalWidth', { value: 120, configurable: true });
    Object.defineProperty(el, 'complete', { value: true, configurable: true });
    document.body.appendChild(withBox(el, 120, 40));

    const r = measureMedia(document);
    expect(r.items[0].claim).toBe('carga-real');
    expect(r.items[0].status).toBe('ok');
    expect(CLAIM_TEXT['carga-real']).toMatch(/carga real/i);
  });

  it('una imagen del paquete que no carga se declara bloqueada', () => {
    const el = document.createElement('img');
    el.setAttribute('data-exe-probe-media', 'image');
    el.setAttribute('data-exe-probe-label', 'logo');
    Object.defineProperty(el, 'naturalWidth', { value: 0, configurable: true });
    Object.defineProperty(el, 'complete', { value: true, configurable: true });
    document.body.appendChild(withBox(el, 120, 40));
    expect(measureMedia(document).items[0].status).toBe('blocked');
  });

  it('una imagen aún sin resolver queda como indeterminada', () => {
    const el = document.createElement('img');
    el.setAttribute('data-exe-probe-media', 'image');
    el.setAttribute('data-exe-probe-label', 'logo');
    Object.defineProperty(el, 'naturalWidth', { value: 0, configurable: true });
    Object.defineProperty(el, 'complete', { value: false, configurable: true });
    document.body.appendChild(withBox(el, 120, 40));
    const r = measureMedia(document);
    expect(r.items[0].status).toBe('unknown');
    expect(r.unknown).toBe(1);
  });

  it('el fondo CSS del paquete se mide por su background-image', () => {
    const el = document.createElement('div');
    el.setAttribute('data-exe-probe-media', 'background');
    el.setAttribute('data-exe-probe-label', 'fondo del paquete');
    el.style.backgroundImage = 'url(probe-asset.svg)';
    document.body.appendChild(withBox(el, 160, 64));
    const r = measureMedia(document);
    expect(r.items[0].claim).toBe('carga-real');
    expect(r.items[0].status).toBe('ok');
  });

  it('un fondo CSS que el anfitrión ha eliminado se declara bloqueado', () => {
    const el = document.createElement('div');
    el.setAttribute('data-exe-probe-media', 'background');
    el.setAttribute('data-exe-probe-label', 'fondo');
    document.body.appendChild(withBox(el, 160, 64));
    expect(measureMedia(document).items[0].status).toBe('blocked');
  });

  it('la fuente del paquete usa document.fonts.check', () => {
    const el = document.createElement('span');
    el.setAttribute('data-exe-probe-media', 'font');
    el.setAttribute('data-exe-probe-label', 'ProbeFont');
    el.setAttribute('data-exe-probe-font', '12px ProbeFont');
    document.body.appendChild(withBox(el, 10, 10));
    document.fonts = { check: (spec) => spec === '12px ProbeFont' };
    expect(measureMedia(document).items[0].status).toBe('ok');
  });

  it('no lanza cuando document.fonts no existe', () => {
    const el = document.createElement('span');
    el.setAttribute('data-exe-probe-media', 'font');
    el.setAttribute('data-exe-probe-label', 'ProbeFont');
    el.setAttribute('data-exe-probe-font', '12px ProbeFont');
    document.body.appendChild(withBox(el, 10, 10));
    document.fonts = undefined;
    expect(() => measureMedia(document)).not.toThrow();
    expect(measureMedia(document).items[0].status).toBe('unknown');
  });

  it('un vídeo del paquete con metadatos cargados se declara carga real', () => {
    const el = document.createElement('video');
    el.setAttribute('data-exe-probe-media', 'video');
    el.setAttribute('data-exe-probe-label', 'vídeo local');
    Object.defineProperty(el, 'readyState', { value: 1, configurable: true });
    Object.defineProperty(el, 'videoWidth', { value: 320, configurable: true });
    document.body.appendChild(el);

    const r = measureMedia(document);
    expect(r.items[0].claim).toBe('carga-real');
    expect(r.items[0].status).toBe('ok');
  });

  it('un vídeo del paquete con error se declara bloqueado', () => {
    const el = document.createElement('video');
    el.setAttribute('data-exe-probe-media', 'video');
    el.setAttribute('data-exe-probe-label', 'vídeo local');
    Object.defineProperty(el, 'error', { value: { code: 4 }, configurable: true });
    document.body.appendChild(el);
    expect(measureMedia(document).items[0].status).toBe('blocked');
  });

  it('un vídeo del paquete aún sin resolver queda como indeterminado', () => {
    const el = document.createElement('video');
    el.setAttribute('data-exe-probe-media', 'video');
    el.setAttribute('data-exe-probe-label', 'vídeo local');
    document.body.appendChild(el);
    const r = measureMedia(document);
    expect(r.items[0].status).toBe('unknown');
    expect(r.unknown).toBe(1);
  });

  it('agrega los totales de varios elementos', () => {
    for (const [kind, w] of [['iframe', 640], ['iframe', 0]]) {
      const el = document.createElement('iframe');
      el.setAttribute('data-exe-probe-media', kind);
      el.setAttribute('data-exe-probe-label', 'x');
      document.body.appendChild(withBox(el, w, 360));
    }
    const r = measureMedia(document);
    expect(r.total).toBe(2);
    expect(r.ok).toBe(1);
    expect(r.blocked).toBe(1);
  });
});
