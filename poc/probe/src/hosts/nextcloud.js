/*
 * Adaptador de Nextcloud: detección, medidas específicas y demos de escritura.
 */
import { uploadFile, renameUser, readRequestToken, readUserId } from './nextcloud-actions.js';

function signalsOf(ctx) {
  const signals = [];
  const pd = ctx.parentDoc();
  const pw = ctx.parentWin();
  if (pd) {
    if (pd.querySelector('meta[name="requesttoken"]')) signals.push('meta[requesttoken]');
    if (pd.querySelector('link[href*="/apps/"], script[src*="/apps/"]')) signals.push('assets /apps/');
    if (pd.getElementById('nextcloud')) signals.push('#nextcloud');
  }
  try { if (pw && pw.OC) signals.push('window.parent.OC'); } catch (e) { /* ignorado */ }
  return signals;
}

export default {
  id: 'nextcloud',
  label: 'Nextcloud',

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
      ncRequestTokenReachable: Boolean(readRequestToken(ctx)),
      ncUserIdReachable: Boolean(readUserId(ctx)),
      ncWebdavLinksReachable: Boolean(pd && pd.querySelector('a[href*="/remote.php/"]')),
    };
  },

  demos: [
    {
      id: 'nc-upload',
      label: 'Subir POC-….txt por WebDAV',
      icon: '📄',
      persists: true,
      help: {
        intenta: 'Escribe un fichero en tu carpeta personal por WebDAV, usando la cookie de sesión y el requesttoken del DOM del padre.',
        protege: 'Escritura de ficheros en la nube de quien abre el material didáctico.',
        reversion: 'El diario borra el fichero con un DELETE al mismo camino.',
        doc: 'anexo-modo-siempre-opaco.md',
      },
      run: uploadFile,
    },
    {
      id: 'nc-rename',
      label: 'Cambiar el nombre visible (OCS)',
      icon: '🖉',
      persists: true,
      help: {
        intenta: 'Cambia tu displayname por la API de aprovisionamiento con el requesttoken de mismo origen.',
        protege: 'Suplantación de identidad ante el resto de la instancia.',
        reversion: 'El diario guarda el nombre anterior y lo repone. Si la instancia no permite el cambio, el resultado es INDETERMINADO, no contención.',
        doc: 'matriz-seguridad.md',
      },
      run: renameUser,
    },
  ],
};
