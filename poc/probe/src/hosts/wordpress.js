/*
 * Adaptador de WordPress: detección, medidas específicas y demos de escritura.
 */
import { rename, photo, createContent } from './wordpress-actions.js';

function signalsOf(ctx) {
  const signals = [];
  const pw = ctx.parentWin();
  const pd = ctx.parentDoc();
  try { if (pw && pw.wpApiSettings) signals.push('wpApiSettings'); } catch (e) { /* ignorado */ }
  if (pd) {
    if (pd.getElementById('wpadminbar')) signals.push('#wpadminbar');
    if (pd.querySelector('link[href*="wp-content"], script[src*="wp-includes"]')) {
      signals.push('assets wp-content/wp-includes');
    }
    if (pd.body && /(^|\s)wp-admin(\s|$)/.test(pd.body.className || '')) signals.push('body.wp-admin');
  }
  return signals;
}

// Activar un plugin ya instalado y crear una cuenta con permisos de
// administración eran la tercera y cuarta acción de la maqueta de diseño
// para WordPress (apartado 5.2 del paquete). Ninguna se implementa como
// demo: un artefacto que crea cuentas con privilegios, aunque las borre acto
// seguido, es una herramienta, no un instrumento, con independencia de la
// intención de quien lo ejecute. En su lugar, measure() solo comprueba si
// esas dos pantallas de administración están enlazadas desde el DOM del
// padre — el menú de administración o su ruta REST —, sin activar ningún
// plugin ni crear ninguna cuenta.
function pluginAdminReachable(pd) {
  return Boolean(pd && pd.querySelector(
    'a[href*="plugins.php"], #menu-plugins, [href*="wp/v2/plugins"]',
  ));
}

function userCreateReachable(pd) {
  return Boolean(pd && pd.querySelector(
    'a[href*="user-new.php"], #menu-users, [href*="wp/v2/users"]',
  ));
}

export default {
  id: 'wordpress',
  label: 'WordPress',

  detect(ctx) {
    const signals = signalsOf(ctx);
    return {
      matched: signals.length > 0,
      confidence: signals.length > 1 ? 'strong' : 'weak',
      signals,
    };
  },

  measure(ctx) {
    const pw = ctx.parentWin();
    const pd = ctx.parentDoc();
    let nonce = false;
    try { nonce = !!(pw && pw.wpApiSettings && pw.wpApiSettings.nonce); } catch (e) { /* ignorado */ }
    return {
      wpRestNonceReachable: nonce,
      wpAdminBarReachable: Boolean(pd && pd.getElementById('wpadminbar')),
      wpProfileFormReachable: Boolean(pd && pd.querySelector('form#your-profile')),
      wpPluginAdminReachable: pluginAdminReachable(pd),
      wpUserCreateReachable: userCreateReachable(pd),
    };
  },

  demos: [
    {
      id: 'wp-rename',
      label: 'Cambiar el nombre → PWNED',
      icon: '🖉',
      persists: true,
      request: 'POST /wp-json/wp/v2/users/me · POST /wp-admin/profile.php',
      help: {
        intenta: 'Cambia el display_name del usuario activo por REST y por el formulario de perfil, con el nonce de mismo origen.',
        protege: 'El nonce se lee del DOM de wp-admin; en origen opaco ese DOM es inaccesible.',
        reversion: 'Reversible desde tu perfil de WordPress. El diario guarda el nombre anterior.',
        doc: 'matriz-seguridad.md',
      },
      run: rename,
    },
    {
      id: 'wp-photo',
      label: 'Avatar + subir a Medios',
      icon: '🖼',
      persists: true,
      request: 'POST /wp-json/wp/v2/media',
      help: {
        intenta: 'Sustituye el avatar en el DOM y sube una imagen a la Biblioteca de Medios: escritura autenticada real.',
        protege: 'Escritura de ficheros en el sitio con la sesión de quien mira el recurso.',
        reversion: 'El diario borra el adjunto por REST; el avatar del DOM se restaura recargando.',
        doc: 'anexos-tecnicos.md',
      },
      run: photo,
    },
    {
      id: 'wp-content',
      label: 'Crear 2 entradas + 2 páginas',
      icon: '🗂',
      persists: true,
      request: 'POST /wp-json/wp/v2/posts ×2 · POST /wp-json/wp/v2/pages ×2',
      help: {
        intenta: 'Toma el nonce REST leído de /wp-admin/ y publica contenido con la sesión del usuario.',
        protege: 'Publicación no autorizada desde material didáctico subido por un tercero.',
        reversion: 'El diario envía cada entrada y página a la papelera por REST.',
        doc: 'matriz-seguridad.md',
      },
      run: createContent,
    },
  ],
};
