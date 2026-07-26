/*
 * Adaptador de Omeka S: detección, medidas específicas y demo de escritura.
 */
import { createItem } from './omeka-actions.js';

function signalsOf(ctx) {
  const signals = [];
  const pd = ctx.parentDoc();
  if (!pd) return signals;
  const gen = pd.querySelector('meta[name="generator"]');
  if (gen && /omeka\s*s/i.test(gen.getAttribute('content') || '')) signals.push('meta[generator]=Omeka S');
  if (pd.querySelector('link[href*="/application/asset/"], script[src*="/application/asset/"]')) {
    signals.push('assets /application/asset/');
  }
  if (pd.querySelector('input[name="csrf"]')) signals.push('input[name=csrf]');
  if (pd.querySelector('#admin-bar, body.admin')) signals.push('barra de administración');
  return signals;
}

export default {
  id: 'omeka',
  label: 'Omeka S',

  detect(ctx) {
    const signals = signalsOf(ctx);
    return {
      matched: signals.length > 0,
      confidence: signals.length > 1 ? 'strong' : 'weak',
      signals,
    };
  },

  measure(ctx) {
    const pd = ctx.parentDoc();
    return {
      omekaCsrfReachable: Boolean(pd && pd.querySelector('input[name="csrf"]')),
      omekaAdminNavReachable: Boolean(pd && pd.querySelector('a[href*="/admin/item"]')),
      omekaSiteFormsReachable: Boolean(pd && pd.querySelector('form[action*="/admin/"]')),
    };
  },

  demos: [
    {
      id: 'omeka-item',
      label: 'Crear ítem POC-…',
      icon: '🗃',
      persists: true,
      request: 'GET /admin/item/add · POST /admin/item/add',
      help: {
        intenta: 'Lee el token csrf del formulario de administración y reenvía /admin/item/add para crear un ítem con la sesión de quien mira el recurso.',
        protege: 'Es CSRF con el token del propio usuario: exige leer el DOM del padre, imposible bajo origen opaco.',
        reversion: 'El diario borra el ítem por /admin/item/{id}/delete con su propio csrf.',
        doc: 'matriz-seguridad.md',
      },
      run: createItem,
    },
  ],
};
