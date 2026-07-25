import { describe, it, expect } from 'vitest';
import { HELP, helpFor, DOC_BASE } from '../src/ui/help.js';
import { renderChecks } from '../src/ui/checks-view.js';
import { computeVerdict, CORE_VECTORS } from '../src/core/verdict.js';
import { createResult } from '../src/core/result.js';

const scene = (over) => {
  const result = Object.assign(createResult(), over || {});
  return {
    doc: document,
    result,
    verdict: computeVerdict(result),
    hostInfo: { adapter: { id: 'moodle', label: 'Moodle' }, matched: true, confidence: 'strong', signals: ['M.cfg'], measures: {} },
    media: { total: 2, ok: 2, blocked: 0, unknown: 0, items: [{ kind: 'iframe', label: 'YouTube', claim: 'frame-no-bloqueado', status: 'ok' }] },
    isOpaqueOrigin: result.isOpaqueOrigin,
  };
};

const html = (over) => {
  const wrap = document.createElement('div');
  wrap.appendChild(renderChecks(scene(over)));
  return wrap;
};

describe('HELP', () => {
  it('documenta las diez claves del veredicto', () => {
    for (const k of CORE_VECTORS) {
      expect(`${k}:${Boolean(HELP[k])}`).toBe(`${k}:true`);
    }
  });

  it('cada entrada dice qué mide, qué implica y de qué protege', () => {
    for (const [k, h] of Object.entries(HELP)) {
      expect(`${k} mide`).toBe(h.mide ? `${k} mide` : `${k} SIN mide`);
      expect(`${k} implica`).toBe(h.implica ? `${k} implica` : `${k} SIN implica`);
      expect(`${k} protege`).toBe(h.protege ? `${k} protege` : `${k} SIN protege`);
    }
  });

  it('cada doc apunta a un fichero real del repositorio', () => {
    const validos = ['matriz-seguridad.md', 'anexos-tecnicos.md', 'anexo-modo-siempre-opaco.md', 'REPRODUCIBILITY.md'];
    for (const [k, h] of Object.entries(HELP)) {
      expect(`${k}:${validos.includes(h.doc)}`).toBe(`${k}:true`);
    }
  });

  it('helpFor rellena las claves sin entrada', () => {
    expect(helpFor('claveInventada').mide).toBeTruthy();
  });
});

describe('renderChecks', () => {
  it('muestra el veredicto con su marcador', () => {
    expect(html({ isOpaqueOrigin: true }).textContent).toMatch(/AISLADO — origen opaco/);
    expect(html({ isOpaqueOrigin: true }).textContent).toMatch(/0 de 10/);
  });

  it('muestra el estado de escape con el número alcanzado', () => {
    expect(html({ canAccessParent: true, canFindSesskey: true }).textContent).toMatch(/2 de 10/);
  });

  it('pinta una fila por cada vector del núcleo, con su ⓘ', () => {
    const wrap = html();
    expect(wrap.querySelectorAll('[data-check]')).toHaveLength(CORE_VECTORS.length);
    expect(wrap.querySelectorAll('button[data-toggle]').length).toBeGreaterThanOrEqual(CORE_VECTORS.length);
  });

  it('la ayuda arranca oculta y el botón la anuncia como plegada', () => {
    const wrap = html();
    expect(wrap.querySelector('[data-help]').hidden).toBe(true);
    expect(wrap.querySelector('button[data-toggle]').getAttribute('aria-expanded')).toBe('false');
  });

  it('bajo origen opaco imprime la URL completa, porque target=_blank está bloqueado', () => {
    const wrap = html({ isOpaqueOrigin: true });
    expect(wrap.textContent).toContain(DOC_BASE);
  });

  it('con origen no opaco basta el enlace', () => {
    const wrap = html();
    expect(wrap.querySelector('a[href^="' + DOC_BASE + '"]')).toBeTruthy();
  });

  it('nombra el anfitrión detectado y sus señales', () => {
    expect(html().textContent).toMatch(/Moodle/);
    expect(html().textContent).toMatch(/M\.cfg/);
  });

  it('dice explícitamente que no poder identificar el anfitrión es una medida', () => {
    const s = scene({ isOpaqueOrigin: true });
    s.hostInfo = { adapter: { id: 'generic', label: 'Anfitrión no identificado' }, matched: false, confidence: 'weak', signals: [], measures: {} };
    const wrap = document.createElement('div');
    wrap.appendChild(renderChecks(s));
    expect(wrap.textContent).toMatch(/no puede identificarse.*es una medida/is);
  });

  it('distingue las dos afirmaciones sobre la media', () => {
    const wrap = html();
    expect(wrap.textContent).toMatch(/no bloqueó/i);
    expect(wrap.textContent).toMatch(/2 de 2/);
  });

  it('el resumen se queda en los diez vectores', () => {
    const wrap = html();
    expect(wrap.querySelector('[data-full-result]')).toBe(null);
  });

  it('el detalle añade las 27 claves del contrato y los errores', () => {
    const s = scene();
    s.detail = true;
    s.result.errors = { canAccessParent: 'SecurityError' };
    const wrap = document.createElement('div');
    wrap.appendChild(renderChecks(s));
    const full = wrap.querySelector('[data-full-result]');
    expect(full).toBeTruthy();
    expect(full.querySelectorAll('[data-check]')).toHaveLength(26); // 27 menos `errors`
    expect(wrap.textContent).toMatch(/SecurityError/);
  });

  it('escapa el contenido en vez de interpolar HTML', () => {
    const wrap = html({ sandboxAttr: '<img src=x onerror=alert(1)>' });
    expect(wrap.querySelector('img')).toBe(null);
    expect(wrap.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
