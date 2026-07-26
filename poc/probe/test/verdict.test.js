import { describe, it, expect } from 'vitest';
import {
  computeVerdict, CORE_VECTORS, CRITICAL_VECTORS, CONDITIONAL_VECTORS,
} from '../src/core/verdict.js';

const base = () => {
  const r = { isOpaqueOrigin: false };
  for (const k of CORE_VECTORS) r[k] = false;
  return r;
};

// Las tres condicionales son las que el contenido legítimo necesita: la API
// SCORM que el modo seguro conserva por el puente postMessage, y el
// almacenamiento propio del documento (measure.js las mide sobre `w`, la
// ventana de la sonda, no sobre la del anfitrión). Solo son peligrosas
// acompañadas de una crítica, porque solo entonces el área que tocan es la
// del anfitrión.
describe('severidad: partición de CORE_VECTORS', () => {
  it('críticas y condicionales parten CORE_VECTORS sin solapes ni sobrantes', () => {
    const union = [...CRITICAL_VECTORS, ...CONDITIONAL_VECTORS];
    expect(new Set(union).size).toBe(union.length); // sin duplicados
    expect(new Set(union)).toEqual(new Set(CORE_VECTORS));
    expect(union).toHaveLength(CORE_VECTORS.length);
  });

  it('las tres condicionales son SCORM y los dos almacenamientos', () => {
    expect(CONDITIONAL_VECTORS).toEqual([
      'canCallScormApi', 'canUseLocalStorage', 'canUseSessionStorage',
    ]);
  });

  it('las siete críticas son las que alcanzan al anfitrión', () => {
    expect(CRITICAL_VECTORS).toHaveLength(7);
    expect(CRITICAL_VECTORS).toContain('canReadParentCookie');
    expect(CRITICAL_VECTORS).toContain('canFindSesskey');
  });
});

describe('computeVerdict', () => {
  it('usa exactamente 10 vectores de núcleo', () => {
    expect(CORE_VECTORS).toHaveLength(10);
  });

  it('excluye los vectores de escape, que son false por diseño', () => {
    expect(CORE_VECTORS).not.toContain('sandboxEscape');
    expect(CORE_VECTORS).not.toContain('sandboxEscapeAttempted');
  });

  it('origen opaco y 0 alcanzados: aislado', () => {
    const v = computeVerdict({ ...base(), isOpaqueOrigin: true });
    expect(v.level).toBe('good');
    expect(v.score).toBe(0);
    expect(v.total).toBe(10);
    expect(v.hit).toEqual([]);
  });

  it('cualquier vector alcanzado: sin aislamiento, aunque el origen sea opaco', () => {
    const v = computeVerdict({ ...base(), isOpaqueOrigin: true, canAccessParent: true });
    expect(v.level).toBe('bad');
    expect(v.score).toBe(1);
    expect(v.hit).toEqual(['canAccessParent']);
  });

  it('0 alcanzados sin origen opaco: contenido pero sin origen opaco', () => {
    const v = computeVerdict(base());
    expect(v.level).toBe('warn');
    expect(v.score).toBe(0);
  });

  it('cuenta todos los vectores alcanzados', () => {
    const v = computeVerdict({
      ...base(),
      canAccessParent: true,
      canReadParentDocument: true,
      canFindSesskey: true,
    });
    expect(v.score).toBe(3);
    expect(v.hit).toHaveLength(3);
  });

  it('ignora valores no booleanos', () => {
    const v = computeVerdict({ ...base(), canAccessParent: 'not_attempted' });
    expect(v.score).toBe(0);
  });

  it('desglosa el reparto entre críticas y condicionales', () => {
    const v = computeVerdict({
      ...base(), canAccessParent: true, canUseLocalStorage: true, canUseSessionStorage: true,
    });
    expect(v.score).toBe(3);
    expect(v.hitCritico).toEqual(['canAccessParent']);
    expect(v.hitCondicional).toEqual(['canUseLocalStorage', 'canUseSessionStorage']);
  });
});

// El caso que el diseño anterior clasificaba mal: un iframe servido desde un
// origen DISTINTO pero no opaco (sin sandbox). No lee el DOM del padre, ni sus
// cookies, ni su sesskey — su almacenamiento es el suyo, no el del anfitrión —
// y aun así salía "☠ SIN AISLAMIENTO, el recurso alcanza el anfitrión".
describe('computeVerdict — solo condicionales alcanzadas', () => {
  it('no es "sin aislamiento": ninguna crítica alcanzada', () => {
    const v = computeVerdict({
      ...base(), canUseLocalStorage: true, canUseSessionStorage: true,
    });
    expect(v.level).toBe('warn');
    expect(v.score).toBe(2);
    expect(v.total).toBe(10);
    expect(v.hitCritico).toEqual([]);
  });

  it('lo dice sin ambigüedad: no hay acceso al anfitrión', () => {
    const v = computeVerdict({ ...base(), canUseLocalStorage: true });
    expect(v.title).toMatch(/SIN ACCESO AL ANFITRIÓN/);
    expect(v.text).toMatch(/2 de 10|1 de 10/);
  });

  it('una sola crítica basta para volver a "sin aislamiento"', () => {
    const v = computeVerdict({
      ...base(), canUseLocalStorage: true, canUseSessionStorage: true,
      canFindCourseEditLinks: true,
    });
    expect(v.level).toBe('bad');
    expect(v.score).toBe(3);
    expect(v.hitCritico).toEqual(['canFindCourseEditLinks']);
  });
});
