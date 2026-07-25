/*
 * Adaptador por defecto. Es el que gana bajo origen opaco, porque ahí el DOM del
 * padre y document.referrer están cortados y NO se puede identificar el
 * anfitrión. Eso no es un fallo del instrumento: es una medida, y el panel lo
 * dice con esas palabras.
 *
 * También es el adaptador que gana cuando SÍ hay acceso al padre pero ese
 * padre no es ninguna de las cuatro plataformas conocidas: un servidor web
 * sin gestor de contenidos detrás (apartado 5.5 del paquete, «Servidor
 * genérico»). measure() añade ahí tres medidas booleanas de capacidad — leer
 * las cookies del dominio, instalar un manejador de teclado, alcanzar un
 * servidor externo — que son la versión segura de las dos acciones que ese
 * apartado describe como riesgo: «registrar las pulsaciones del teclado» y
 * «enviar el contenido de la página a otro servidor». Se detecta la
 * capacidad, igual que measure.js detecta la API SCORM sin invocarla o abre
 * y cierra un popup sin navegarlo: ninguna de las tres captura un evento de
 * teclado, ninguna hace una petición de red, ninguna lee el valor de una
 * cookie.
 */

function cookiesReadable(pd) {
  try {
    return Boolean(pd) && typeof pd.cookie === 'string';
  } catch (e) {
    return false;
  }
}

// Instala un manejador vacío y lo retira en el mismo tick: prueba que la
// instalación es posible (igual que measure.js abre y cierra un popup 1x1)
// sin que el manejador llegue a ejecutarse ni a leer un solo evento.
function keyboardHookInstallable(pd) {
  if (!pd) return false;
  const noop = () => {};
  try {
    pd.addEventListener('keydown', noop);
    pd.removeEventListener('keydown', noop);
    return true;
  } catch (e) {
    return false;
  }
}

// Nunca se hace una petición real: se detecta si el navegador dejaría pasar
// una conexión saliente (fetch disponible y ninguna CSP declarada en meta
// que restrinja connect-src), no si una petición concreta tendría éxito.
// Misma disciplina que el resto de measure.js: capacidad detectada, nunca
// intentada.
function externalConnectReachable(win, pd) {
  try {
    if (!win || typeof win.fetch !== 'function') return false;
    if (!pd) return false;
    const meta = pd.querySelector('meta[http-equiv="Content-Security-Policy" i]');
    if (!meta) return true;
    const content = meta.getAttribute('content') || '';
    return !/connect-src/i.test(content);
  } catch (e) {
    return false;
  }
}

export default {
  id: 'generic',
  label: 'Anfitrión no identificado',
  detect() {
    return {
      matched: false,
      confidence: 'weak',
      signals: ['sin acceso al DOM del padre: el anfitrión no puede identificarse'],
    };
  },
  measure(ctx) {
    const pd = (ctx && ctx.parentDoc && ctx.parentDoc()) || null;
    const win = (ctx && ctx.win) || null;
    return {
      genericCookiesReadable: cookiesReadable(pd),
      genericKeyboardHookInstallable: keyboardHookInstallable(pd),
      genericExternalConnectReachable: externalConnectReachable(win, pd),
    };
  },
  demos: [],
};
