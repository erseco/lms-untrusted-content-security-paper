import { describe, it, expect } from 'vitest';
import { computeVerdict, CORE_VECTORS } from '../src/core/verdict.js';

const base = () => {
  const r = { isOpaqueOrigin: false };
  for (const k of CORE_VECTORS) r[k] = false;
  return r;
};

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
});
