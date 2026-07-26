import { describe, it, expect, vi } from 'vitest';
import { createJournal } from '../src/core/journal.js';

const memStorage = () => {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
  };
};

describe('createJournal', () => {
  it('prefija con el buildId', () => {
    const j = createJournal({ buildId: 'abc123', storage: memStorage() });
    expect(j.prefix('curso')).toMatch(/^POC-abc123-\d+-curso$/);
  });

  it('registra entradas y las devuelve en orden de inserción', () => {
    const j = createJournal({ buildId: 'b', storage: memStorage() });
    j.record({ host: 'moodle', kind: 'course', label: 'Curso', id: '7' });
    j.record({ host: 'wordpress', kind: 'post', label: 'Entrada', id: '9' });
    expect(j.entries().map((e) => e.id)).toEqual(['7', '9']);
  });

  it('revierte en orden inverso al de inserción', async () => {
    const order = [];
    const j = createJournal({ buildId: 'b', storage: memStorage() });
    j.record({ host: 'h', kind: 'k', label: 'primero', undo: () => order.push('primero') });
    j.record({ host: 'h', kind: 'k', label: 'segundo', undo: () => order.push('segundo') });
    await j.revertAll();
    expect(order).toEqual(['segundo', 'primero']);
  });

  it('cuenta revertidas, fallidas y no reversibles por separado', async () => {
    const j = createJournal({ buildId: 'b', storage: memStorage() });
    j.record({ host: 'h', kind: 'k', label: 'ok', undo: () => {} });
    j.record({ host: 'h', kind: 'k', label: 'rota', undo: () => { throw new Error('boom'); } });
    j.record({ host: 'h', kind: 'k', label: 'manual' });
    const saldo = await j.revertAll();
    expect(saldo).toEqual({ reverted: 1, failed: 1, notReversible: 1 });
  });

  it('no dice revertido cuando no lo está', async () => {
    const j = createJournal({ buildId: 'b', storage: memStorage() });
    j.record({ host: 'h', kind: 'k', label: 'manual' });
    await j.revertAll();
    expect(j.entries()[0].status).toBe('notReversible');
    expect(j.summary()).toMatch(/1 no reversible/);
  });

  it('no reintenta una entrada ya revertida', async () => {
    const undo = vi.fn();
    const j = createJournal({ buildId: 'b', storage: memStorage() });
    j.record({ host: 'h', kind: 'k', label: 'ok', undo });
    await j.revertAll();
    await j.revertAll();
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('espera a un undo asíncrono', async () => {
    let done = false;
    const j = createJournal({ buildId: 'b', storage: memStorage() });
    j.record({
      host: 'h', kind: 'k', label: 'async',
      undo: () => new Promise((res) => setTimeout(() => { done = true; res(); }, 5)),
    });
    await j.revertAll();
    expect(done).toBe(true);
  });

  it('funciona cuando el almacenamiento lanza, como bajo sandbox', () => {
    const hostile = {
      getItem() { throw new DOMException('blocked', 'SecurityError'); },
      setItem() { throw new DOMException('blocked', 'SecurityError'); },
    };
    const j = createJournal({ buildId: 'b', storage: hostile });
    expect(() => j.record({ host: 'h', kind: 'k', label: 'x' })).not.toThrow();
    expect(j.entries()).toHaveLength(1);
  });
});
