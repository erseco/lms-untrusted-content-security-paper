/*
 * Contrato del adaptador de anfitrión.
 *
 * Añadir una plataforma es añadir un fichero que cumpla esto: el núcleo no se
 * toca. validateAdapter se ejecuta en test, no en producción.
 */

export function validateAdapter(adapter) {
  const problems = [];
  if (!adapter || typeof adapter !== 'object') return ['no es un objeto'];
  if (!adapter.id) problems.push('falta id');
  if (!adapter.label) problems.push('falta label');
  if (typeof adapter.detect !== 'function') problems.push('detect no es función');
  if (typeof adapter.measure !== 'function') problems.push('measure no es función');
  if (!Array.isArray(adapter.demos)) {
    problems.push('demos no es array');
    return problems;
  }

  for (const demo of adapter.demos) {
    const name = 'demo ' + (demo && demo.id ? demo.id : '(sin id)');
    if (!demo || !demo.id) { problems.push(name + ': falta id'); continue; }
    if (!demo.label) problems.push(name + ': falta label');
    if (typeof demo.persists !== 'boolean') problems.push(name + ': persists no es booleano');
    if (typeof demo.run !== 'function') problems.push(name + ': run no es función');
    if (!demo.help || !demo.help.intenta || !demo.help.protege || !demo.help.reversion) {
      problems.push(name + ': help incompleto (intenta/protege/reversion)');
    }
  }
  return problems;
}

/*
 * Contexto que reciben detect/measure/run. Todo acceso al anfitrión pasa por
 * aquí y nunca lanza al llamador: bajo origen opaco simplemente devuelve null.
 */
export function createContext(options) {
  const win = options.win || window;

  function parentWin() {
    try {
      const p = win.parent;
      if (!p || p === win) return null;
      void p.location.href; // lanza si cross-origin/opaco
      return p;
    } catch (e) {
      return null;
    }
  }

  // Misma prueba de "no hay padre" que parentWin: sin el p === win, un
  // documento ejecutado como top-level de verdad (sin ningún iframe por
  // encima) se devolvía a sí mismo en vez de null, porque window.parent de
  // la ventana top es la propia ventana. Con eso, showcase.js:blocked()
  // creía tener un padre alcanzable y dejaba correr las demos de la vitrina
  // de impacto contra la propia página en vez de reportar BLOQUEADO
  // (hallazgo del Fix 5 de la tarea 23).
  function parentDoc() {
    try {
      const p = win.parent;
      if (!p || p === win) return null;
      const d = p.document;
      return d || null;
    } catch (e) {
      return null;
    }
  }

  return {
    win,
    journal: options.journal,
    buildId: options.buildId,
    parentWin,
    parentDoc,
    fetchSameOrigin(url, init) {
      const opts = Object.assign({ credentials: 'same-origin' }, init || {});
      return win.fetch(url, opts);
    },
  };
}
