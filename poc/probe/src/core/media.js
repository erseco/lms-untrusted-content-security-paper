/*
 * La media embebida como control medido.
 *
 * Da valor al vídeo sin moverlo de sitio: demuestra la otra mitad del argumento
 * — aislar el JavaScript del autor no rompe la media legítima — y detecta el
 * falso positivo en que la CSP del anfitrión mata también los embeds válidos.
 *
 * Dos afirmaciones DISTINTAS, que no se mezclan:
 *   frame-no-bloqueado : lo máximo que puede afirmarse de un embed cross-origin.
 *   carga-real         : reservado a los assets propios del paquete.
 */

export const CLAIM_TEXT = {
  'frame-no-bloqueado':
    'El navegador no bloqueó el frame y ocupa su caja. No puede afirmarse que el ' +
    'vídeo reproduzca: en cross-origin el navegador no lo expone.',
  'carga-real':
    'Carga real verificada. Es un asset del propio paquete, así que sí puede ' +
    'afirmarse que se sirvió correctamente.',
};

const CLAIM_BY_KIND = {
  iframe: 'frame-no-bloqueado',
  object: 'frame-no-bloqueado',
  image: 'carga-real',
  font: 'carga-real',
  background: 'carga-real',
  video: 'carga-real',
};

function hasBox(el) {
  try {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  } catch (e) {
    return false;
  }
}

function statusOf(el, kind) {
  if (kind === 'iframe' || kind === 'object') {
    if (el.hasAttribute('data-exe-shim-placeholder')) return 'blocked';
    return hasBox(el) ? 'ok' : 'blocked';
  }

  if (kind === 'image') {
    if (!el.complete) return 'unknown';
    return el.naturalWidth > 0 ? 'ok' : 'blocked';
  }

  if (kind === 'background') {
    // Un <div> no tiene naturalWidth: lo medible es si el fondo sigue declarado
    // y el elemento ocupa caja. Detecta que el anfitrión no haya matado el CSS.
    if (!hasBox(el)) return 'blocked';
    try {
      const bg = el.ownerDocument.defaultView.getComputedStyle(el).backgroundImage;
      return bg && bg !== 'none' ? 'ok' : 'blocked';
    } catch (e) {
      return 'unknown';
    }
  }

  if (kind === 'font') {
    const spec = el.getAttribute('data-exe-probe-font');
    try {
      const fonts = el.ownerDocument && el.ownerDocument.fonts;
      if (!fonts || typeof fonts.check !== 'function') return 'unknown';
      return fonts.check(spec) ? 'ok' : 'blocked';
    } catch (e) {
      return 'unknown';
    }
  }

  if (kind === 'video') {
    // A diferencia de iframe/object, un <video> propio del paquete sí expone
    // señales directas de carga (readyState, videoWidth, error): no hace
    // falta apoyarse en hasBox, que aquí solo confundiría "oculto por CSS"
    // con "no cargado".
    try {
      if (el.error) return 'blocked';
      if (el.readyState >= 1 || el.videoWidth > 0) return 'ok';
      return 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  return 'unknown';
}

export function measureMedia(doc) {
  const d = doc || document;
  const nodes = d.querySelectorAll('[data-exe-probe-media]');
  const items = [];
  let ok = 0;
  let blocked = 0;
  let unknown = 0;

  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    const kind = el.getAttribute('data-exe-probe-media');
    const status = statusOf(el, kind);
    if (status === 'ok') ok += 1;
    else if (status === 'blocked') blocked += 1;
    else unknown += 1;

    items.push({
      kind,
      label: el.getAttribute('data-exe-probe-label') || kind,
      claim: CLAIM_BY_KIND[kind] || 'frame-no-bloqueado',
      status,
    });
  }

  return { total: nodes.length, ok, blocked, unknown, items };
}
