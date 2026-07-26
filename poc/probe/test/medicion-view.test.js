import { describe, it, expect, beforeEach } from 'vitest';
import { renderMedicionNative, MEDICION_ATTR } from '../src/ui/medicion-view.js';
import { computeVerdict, CORE_VECTORS } from '../src/core/verdict.js';
import { createResult } from '../src/core/result.js';
import { CAPABILITIES } from '../src/ui/help.js';

// Réplica mínima del HTML estático que exelib.py debe generar para el
// apartado 1: un contenedor marcado con MEDICION_ATTR, la caja de veredicto,
// y una fila <tr data-exe-probe-row="clave"> por cada CORE_VECTOR, con sus
// celdas de valor/resultado vacías (esto es justo lo que rellena la sonda).
function buildShell() {
  const wrap = document.createElement('div');
  wrap.setAttribute(MEDICION_ATTR, '');

  const verdictBox = document.createElement('div');
  verdictBox.setAttribute('data-exe-probe-verdict', '');
  const title = document.createElement('p');
  title.setAttribute('data-exe-probe-verdict-title', '');
  const text = document.createElement('p');
  text.setAttribute('data-exe-probe-verdict-text', '');
  verdictBox.append(title, text);
  wrap.appendChild(verdictBox);

  const table = document.createElement('table');
  const tbody = document.createElement('tbody');
  for (const c of CAPABILITIES) {
    const tr = document.createElement('tr');
    tr.setAttribute('data-exe-probe-row', c.key);
    const tdTexto = document.createElement('td');
    tdTexto.textContent = c.texto;
    const tdProp = document.createElement('td');
    tdProp.textContent = c.prop;
    const tdValor = document.createElement('td');
    tdValor.setAttribute('data-exe-probe-valor', '');
    const tdResultado = document.createElement('td');
    tdResultado.setAttribute('data-exe-probe-resultado', '');
    tr.append(tdTexto, tdProp, tdValor, tdResultado);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);

  document.body.appendChild(wrap);
  return wrap;
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('renderMedicionNative', () => {
  it('CAPABILITIES cubre exactamente los diez CORE_VECTORS, en el mismo orden', () => {
    expect(CAPABILITIES.map((c) => c.key)).toEqual(CORE_VECTORS);
  });

  it('rellena el título y el texto de la caja de veredicto', () => {
    const container = buildShell();
    const result = Object.assign(createResult(), { isOpaqueOrigin: true });
    renderMedicionNative(document, container, { result, verdict: computeVerdict(result) });
    const title = container.querySelector('[data-exe-probe-verdict-title]');
    expect(title.textContent).toContain('AISLADO');
  });

  it('añade una clase de nivel a la caja de veredicto, sin dejar las anteriores', () => {
    const container = buildShell();
    const result = Object.assign(createResult(), { isOpaqueOrigin: true });
    const box = container.querySelector('[data-exe-probe-verdict]');
    box.classList.add('is-sin-aislamiento'); // simula un montaje previo con otro nivel
    renderMedicionNative(document, container, { result, verdict: computeVerdict(result) });
    expect(box.classList.contains('is-aislado')).toBe(true);
    expect(box.classList.contains('is-sin-aislamiento')).toBe(false);
  });

  it('nunca usa innerHTML con datos medidos: escapa cualquier HTML en el texto del veredicto', () => {
    const container = buildShell();
    const result = createResult();
    const verdict = Object.assign(computeVerdict(result), { text: '<img src=x onerror=alert(1)>' });
    renderMedicionNative(document, container, { result, verdict });
    expect(container.querySelector('img')).toBe(null);
    expect(container.querySelector('[data-exe-probe-verdict-text]').textContent).toContain('<img');
  });

  it('para una capacidad booleana normal, sin alcanzar, escribe "no alcanzable" y "Bloqueado"', () => {
    const container = buildShell();
    const result = createResult(); // todo false por defecto
    renderMedicionNative(document, container, { result, verdict: computeVerdict(result) });
    const row = container.querySelector('[data-exe-probe-row="canAccessParent"]');
    expect(row.querySelector('[data-exe-probe-valor]').textContent).toBe('no alcanzable');
    expect(row.querySelector('[data-exe-probe-resultado]').textContent).toBe('Bloqueado');
    expect(row.querySelector('[data-exe-probe-resultado]').classList.contains('is-bloqueado')).toBe(true);
  });

  it('para una capacidad booleana normal, alcanzada, escribe "presente" y "Ha podido"', () => {
    const container = buildShell();
    const result = Object.assign(createResult(), { canAccessParent: true });
    renderMedicionNative(document, container, { result, verdict: computeVerdict(result) });
    const row = container.querySelector('[data-exe-probe-row="canAccessParent"]');
    expect(row.querySelector('[data-exe-probe-valor]').textContent).toBe('presente');
    expect(row.querySelector('[data-exe-probe-resultado]').textContent).toBe('Ha podido');
    expect(row.querySelector('[data-exe-probe-resultado]').classList.contains('is-alcanzado')).toBe(true);
  });

  it('para el sesskey alcanzado, muestra presencia y longitud, nunca el valor', () => {
    const container = buildShell();
    const result = Object.assign(createResult(), { canFindSesskey: true, sesskeyLength: 10 });
    renderMedicionNative(document, container, { result, verdict: computeVerdict(result) });
    const row = container.querySelector('[data-exe-probe-row="canFindSesskey"]');
    expect(row.querySelector('[data-exe-probe-valor]').textContent).toBe('presente · 10 caracteres');
  });

  it('para las cookies alcanzadas, muestra el recuento y cuántas parecen de sesión, nunca el nombre ni el valor', () => {
    const container = buildShell();
    const result = Object.assign(createResult(), {
      canReadParentCookie: true, parentCookieCount: 4, parentCookieSessionLikeCount: 1,
    });
    renderMedicionNative(document, container, { result, verdict: computeVerdict(result) });
    const row = container.querySelector('[data-exe-probe-row="canReadParentCookie"]');
    expect(row.querySelector('[data-exe-probe-valor]').textContent).toBe('4 cookie(s), 1 de sesión');
  });

  it('las columnas sensibles no alcanzadas también dicen "no alcanzable", no un cero engañoso', () => {
    const container = buildShell();
    const result = createResult();
    renderMedicionNative(document, container, { result, verdict: computeVerdict(result) });
    const sesskeyRow = container.querySelector('[data-exe-probe-row="canFindSesskey"]');
    const cookieRow = container.querySelector('[data-exe-probe-row="canReadParentCookie"]');
    expect(sesskeyRow.querySelector('[data-exe-probe-valor]').textContent).toBe('no alcanzable');
    expect(cookieRow.querySelector('[data-exe-probe-valor]').textContent).toBe('no alcanzable');
  });

  it('nunca imprime un valor de sesión real aunque result lo llevara filtrado', () => {
    const container = buildShell();
    const result = Object.assign(createResult(), {
      canReadParentCookie: true, parentCookieCount: 2, parentCookieSessionLikeCount: 1,
      parentCookieValue: 'MoodleSession=FUGA-CENTINELA',
      canFindSesskey: true, sesskeyLength: 10, sesskeyValue: 'FUGA-CENTINELA-SESSKEY',
    });
    renderMedicionNative(document, container, { result, verdict: computeVerdict(result) });
    expect(container.textContent).not.toContain('FUGA-CENTINELA');
  });

  it('es idempotente: una segunda llamada sobre el mismo contenedor no cambia nada ni revienta', () => {
    const container = buildShell();
    const result = Object.assign(createResult(), { canAccessParent: true });
    renderMedicionNative(document, container, { result, verdict: computeVerdict(result) });
    const before = container.querySelector('[data-exe-probe-row="canAccessParent"] [data-exe-probe-valor]').textContent;
    const result2 = createResult(); // todo false: si volviera a montar, cambiaría a "no alcanzable"
    expect(() => renderMedicionNative(document, container, { result: result2, verdict: computeVerdict(result2) })).not.toThrow();
    expect(container.querySelector('[data-exe-probe-row="canAccessParent"] [data-exe-probe-valor]').textContent).toBe(before);
  });

  it('sin contenedor, o sin filas, no revienta', () => {
    expect(() => renderMedicionNative(document, null, { result: createResult(), verdict: computeVerdict(createResult()) })).not.toThrow();
    const empty = document.createElement('div');
    empty.setAttribute(MEDICION_ATTR, '');
    expect(() => renderMedicionNative(document, empty, { result: createResult(), verdict: computeVerdict(createResult()) })).not.toThrow();
  });
});
