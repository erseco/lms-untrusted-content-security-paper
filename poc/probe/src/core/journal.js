/*
 * Diario de reversión.
 *
 * Toda demo que escribe en el anfitrión registra AQUÍ antes de actuar. revertAll
 * recorre en orden inverso y deja el saldo a la vista: nunca se muestra
 * "restaurado" cuando no lo está.
 *
 * El almacenamiento es un extra: bajo sandbox opaco el acceso lanza, y ese es el
 * camino normal en modo seguro, donde además no se escribe nada.
 */

const STORAGE_KEY = 'exePocJournal';

export function createJournal(options) {
  const buildId = (options && options.buildId) || 'dev';
  const storage = options && options.storage;
  const entries = [];
  let seq = 0;

  function stamp() {
    // Contador monótono en lugar de Date.now() para que el prefijo sea estable
    // dentro de una misma sesión y no dependa del reloj.
    seq += 1;
    return String(Date.now()) + String(seq);
  }

  function persist() {
    if (!storage) return;
    try {
      storage.setItem(
        STORAGE_KEY,
        JSON.stringify(
          entries.map((e) => ({
            host: e.host, kind: e.kind, label: e.label,
            id: e.id, previous: e.previous, status: e.status,
          })),
        ),
      );
    } catch (e) {
      // Bajo sandbox el acceso lanza. El diario en memoria sigue siendo válido.
    }
  }

  return {
    prefix(label) {
      return 'POC-' + buildId + '-' + stamp() + '-' + label;
    },

    record(spec) {
      const entry = {
        host: spec.host,
        kind: spec.kind,
        label: spec.label,
        id: typeof spec.id === 'undefined' ? null : spec.id,
        previous: typeof spec.previous === 'undefined' ? null : spec.previous,
        undo: typeof spec.undo === 'function' ? spec.undo : null,
        status: 'pending',
        error: null,
      };
      entries.push(entry);
      persist();
      return entry;
    },

    entries() {
      return entries.slice();
    },

    async revertAll() {
      const saldo = { reverted: 0, failed: 0, notReversible: 0 };
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        if (entry.status === 'reverted') {
          saldo.reverted += 1;
          continue;
        }
        if (!entry.undo) {
          entry.status = 'notReversible';
          saldo.notReversible += 1;
          continue;
        }
        try {
          await entry.undo();
          entry.status = 'reverted';
          saldo.reverted += 1;
        } catch (e) {
          entry.status = 'failed';
          entry.error = (e && e.name) || 'Error';
          saldo.failed += 1;
        }
      }
      persist();
      return saldo;
    },

    summary() {
      const counts = { reverted: 0, failed: 0, notReversible: 0, pending: 0 };
      for (const entry of entries) counts[entry.status] += 1;
      return (
        counts.reverted + ' revertida(s), ' +
        counts.failed + ' fallida(s), ' +
        counts.notReversible + ' no reversible(s), ' +
        counts.pending + ' sin revertir'
      );
    },
  };
}
