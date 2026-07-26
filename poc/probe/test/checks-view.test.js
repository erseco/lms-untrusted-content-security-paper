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

  // texto es la etiqueta principal que checks-view.js pinta ahora en vez de
  // la clave técnica (p. ej. «Leer las cookies de sesión de esa página» en
  // vez de canReadParentCookie) — sin él, la fila caería de vuelta al
  // nombre de la clave.
  it('cada entrada trae una descripción en lenguaje llano (texto)', () => {
    for (const [k, h] of Object.entries(HELP)) {
      expect(`${k} texto`).toBe(h.texto ? `${k} texto` : `${k} SIN texto`);
    }
  });

  it('helpFor rellena también texto para las claves sin entrada', () => {
    expect(helpFor('claveInventada').texto).toBeTruthy();
  });

  // Ninguna descripción puede parecerse a un valor de sesión real — ni
  // siquiera a los marcadores de ejemplo de la maqueta de diseño
  // (MoodleSession=k3f9a1c2e7b4, 8Kd2mQpTvA): ese fue justo el error que
  // esta comprobación existe para no repetir.
  it('ninguna descripción incluye un valor de sesión de ejemplo', () => {
    const sospechoso = /[a-f0-9]{8,}|MoodleSession=|wpApiSettings|k3f9a1c2e7b4|8Kd2mQpTvA/i;
    for (const [k, h] of Object.entries(HELP)) {
      const texto = [h.texto, h.mide, h.implica, h.protege].join(' ');
      expect(`${k}:${sospechoso.test(texto)}`).toBe(`${k}:false`);
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
    // 30 (27 originales + 3 añadidas en el fix round) menos `errors` (se
    // lista aparte) y menos `sandboxAttr` (ya se muestra con su ⓘ en el
    // bloque Anfitrión, no se repite aquí).
    expect(full.querySelectorAll('[data-check]')).toHaveLength(28);
    expect(wrap.textContent).toMatch(/SecurityError/);
  });

  it('escapa el contenido en vez de interpolar HTML', () => {
    const wrap = html({ sandboxAttr: '<img src=x onerror=alert(1)>' });
    expect(wrap.querySelector('img')).toBe(null);
    expect(wrap.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('el sandbox del anfitrión lleva su propia ⓘ, sin contar como vector del núcleo', () => {
    const wrap = html({ sandboxAttr: 'allow-scripts' });
    const row = wrap.querySelector('[data-host-check="sandboxAttr"]');
    expect(row).toBeTruthy();
    expect(wrap.querySelectorAll('[data-check]')).toHaveLength(CORE_VECTORS.length);
  });

  // Regresión: el valor real de sandboxAttr en la suite es esta cadena larga.
  // Sin min-width:0 en los dos huecos de la fila, todo el encogimiento caía en
  // la etiqueta y "sandboxAttr" se partía letra a letra en vertical mientras
  // el valor se quedaba en una sola línea sin envolver.
  it('un sandboxAttr largo envuelve el valor y no colapsa la etiqueta', () => {
    const largo = 'allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-popups allow-presentation';
    const wrap = html({ sandboxAttr: largo });
    const row = wrap.querySelector('[data-host-check="sandboxAttr"]');
    expect(row).toBeTruthy();
    const [label, pill] = row.children;
    // La etiqueta ya no es la clave técnica (ver "adopta lenguaje llano…"
    // más abajo): sigue siendo el hueco de texto corto y elástico, ahora con
    // la descripción de HELP.sandboxAttr.texto.
    expect(label.textContent).toBe(HELP.sandboxAttr.texto);
    expect(label.style.minWidth).toBe('0');
    expect(label.style.flex).toContain('1');
    // El valor, no la etiqueta, es el que lleva el tope de ancho y la
    // envoltura: así es él quien rompe línea bajo presión, nunca la clave.
    expect(pill.style.minWidth).toBe('0');
    expect(pill.style.maxWidth).toBeTruthy();
    expect(pill.style.whiteSpace).toBe('normal');
    expect(pill.style.wordBreak).toBe('break-word');
  });

  it('cada fila muestra la descripción en lenguaje llano, con la clave técnica relegada a la ayuda', () => {
    const wrap = html();
    const row = wrap.querySelector('[data-check="canReadParentCookie"]');
    expect(row.children[0].textContent).toBe(HELP.canReadParentCookie.texto);
    expect(row.textContent).not.toContain('canReadParentCookie');
    const help = row.nextElementSibling;
    expect(help.textContent).toContain('canReadParentCookie');
    expect(help.textContent).toContain('Propiedad comprobada');
  });

  // En el espíritu de test/redaction.test.js, pero un piso más arriba: ese
  // test comprueba que measure.js nunca CALCULA un valor real; este
  // comprueba que checks-view.js nunca lo IMPRIME, aunque measure.js
  // llegara a filtrarlo algún día. Dos barreras independientes.
  it('nunca imprime el valor real de una clave redactada, aunque measure.js llegara a filtrarlo', () => {
    const s = scene();
    s.detail = true;
    s.result.parentCookieValue = 'MoodleSession=FUGA-CENTINELA';
    s.result.sesskeyValue = 'FUGA-CENTINELA-SESSKEY';
    s.result.parentCookieNames = 'FUGA-CENTINELA-NAMES';
    s.result.parentCookieLength = 'FUGA-CENTINELA-LENGTH';
    const wrap = document.createElement('div');
    wrap.appendChild(renderChecks(s));
    expect(wrap.textContent).not.toContain('FUGA-CENTINELA');
    expect(wrap.querySelector('[data-check="parentCookieValue"]').textContent).toMatch(/redactado/);
    expect(wrap.querySelector('[data-check="sesskeyValue"]').textContent).toMatch(/redactado/);
  });

  it('las medidas del anfitrión también imprimen la URL completa bajo origen opaco', () => {
    const s = scene({ isOpaqueOrigin: true });
    s.hostInfo = {
      adapter: { id: 'moodle', label: 'Moodle' },
      matched: true,
      confidence: 'strong',
      signals: ['M.cfg'],
      measures: { esAdminMoodle: true },
    };
    const wrap = document.createElement('div');
    wrap.appendChild(renderChecks(s));
    const row = wrap.querySelector('[data-check="esAdminMoodle"]');
    expect(row).toBeTruthy();
    const help = row.nextElementSibling;
    expect(help.getAttribute('data-help')).toBe('esAdminMoodle');
    expect(help.textContent).toContain(DOC_BASE);
  });
});
