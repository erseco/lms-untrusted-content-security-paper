import { describe, it, expect } from 'vitest';
import { classifyDemoResult, DEMO_STATES } from '../src/core/classify.js';

const opaque = { isOpaqueOrigin: true };
const legacy = { isOpaqueOrigin: false };

describe('classifyDemoResult', () => {
  it('reconoce el rechazo explícito del sandbox', () => {
    expect(classifyDemoResult('BLOQUEADO (origen opaco)', legacy).state).toBe('contained');
    expect(classifyDemoResult('SecurityError al leer parent', legacy).state).toBe('contained');
  });

  it('reconoce una escritura efectiva en el anfitrión', () => {
    expect(classifyDemoResult(JSON.stringify({ created: true }), legacy).state).toBe('escaped');
    expect(classifyDemoResult(JSON.stringify({ renamed: true }), legacy).state).toBe('escaped');
    expect(classifyDemoResult(JSON.stringify({ forumMessages: 50 }), legacy).state).toBe('escaped');
    expect(classifyDemoResult(JSON.stringify({ posts: ['#12', '#13'] }), legacy).state).toBe('escaped');
    expect(classifyDemoResult(JSON.stringify({ mediaUpload: 'ok #7' }), legacy).state).toBe('escaped');
  });

  it('trata como INDETERMINADO lo que llegó al anfitrión sin completarse', () => {
    const r = classifyDemoResult(JSON.stringify({ renamed: false, note: 'sin sesskey' }), legacy);
    expect(r.state).toBe('unknown');
    expect(r.message).toMatch(/NO es prueba de aislamiento/);
  });

  it('bajo origen opaco, un fallo sin completar cuenta como contenido', () => {
    expect(
      classifyDemoResult(JSON.stringify({ renamed: false }), opaque).state,
    ).toBe('contained');
  });

  it('un OK en texto plano es un escape', () => {
    expect(classifyDemoResult('OK: el anfitrión se ha volteado', legacy).state).toBe('escaped');
  });

  it('acepta objetos además de cadenas', () => {
    expect(classifyDemoResult({ created: true }, legacy).state).toBe('escaped');
  });

  it('un valor falso con clave ganadora no es escape', () => {
    expect(classifyDemoResult(JSON.stringify({ created: false }), legacy).state).toBe('unknown');
  });

  it('expone las etiquetas visibles de los cinco estados', () => {
    expect(DEMO_STATES.contained.label).toMatch(/BLOQUEADO/);
    expect(DEMO_STATES.escaped.label).toMatch(/ESCAPE/);
    expect(DEMO_STATES.unknown.label).toMatch(/INDETERMINADO/);
    expect(DEMO_STATES.idle.label).toBeTruthy();
    expect(DEMO_STATES.running.label).toBeTruthy();
  });
});
