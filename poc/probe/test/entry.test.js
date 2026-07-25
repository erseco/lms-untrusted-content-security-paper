import { describe, it, expect, beforeEach, vi } from 'vitest';
import { startProbe } from '../src/entry/probe.js';

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
