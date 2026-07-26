/*
 * Veredicto de cabecera. Diez vectores de núcleo, estables entre plataformas,
 * para que el marcador siga siendo comparable con los resultados-*.json ya
 * publicados. sandboxEscape / sandboxEscapeAttempted quedan fuera a propósito:
 * son false por diseño y falsearían el marcador al alza.
 *
 * CORE_VECTORS se declara aquí como literal explícito, no derivado de
 * capabilities.json: es un contrato congelado, y el test de sincronía de
 * medicion-view.test.js necesita dos fuentes que comparar para servir de algo.
 * La SEVERIDAD, en cambio, sí sale de capabilities.json — es el único sitio
 * donde se decide, y así la tabla del apartado 1 (que la lee desde Python) y
 * el veredicto no pueden discrepar.
 */
import CAPABILITIES from './capabilities.json';

export const CORE_VECTORS = [
  'sandboxAllowsSameOrigin',
  'canAccessParent',
  'canReadParentDocument',
  'canReadParentCookie',
  'canFindSesskey',
  'canFindCourseEditForms',
  'canFindCourseEditLinks',
  'canCallScormApi',
  'canUseLocalStorage',
  'canUseSessionStorage',
];

/*
 * Críticas: alcanzarlas ES alcanzar la sesión de quien abre el recurso.
 *
 * Condicionales: capacidades que el contenido legítimo necesita —la API SCORM
 * que el modo seguro conserva por el puente postMessage validado, y el
 * almacenamiento del propio documento—. measure.js mide localStorage y
 * sessionStorage sobre `w`, la ventana de la SONDA, no sobre la del anfitrión:
 * `true` significa «este documento tiene un almacenamiento utilizable», y solo
 * significa «comparte el del anfitrión» cuando además hay acceso de mismo
 * origen, es decir, cuando alguna crítica también es true. Contarlas por
 * separado evita el falso positivo del contenido servido desde un origen
 * distinto pero no opaco, que no alcanza nada y aun así puntuaba como escape.
 */
export const CRITICAL_VECTORS = CAPABILITIES
  .filter((c) => c.severidad === 'critica').map((c) => c.key);
export const CONDITIONAL_VECTORS = CAPABILITIES
  .filter((c) => c.severidad === 'condicional').map((c) => c.key);

export function computeVerdict(result) {
  const hit = CORE_VECTORS.filter((k) => result[k] === true);
  const total = CORE_VECTORS.length;
  const hitCritico = hit.filter((k) => CRITICAL_VECTORS.indexOf(k) !== -1);
  const hitCondicional = hit.filter((k) => CONDITIONAL_VECTORS.indexOf(k) !== -1);

  if (hitCritico.length > 0) {
    return {
      level: 'bad',
      icon: '☠',
      title: 'SIN AISLAMIENTO — el recurso alcanza el anfitrión',
      text:
        hit.length + ' de ' + total + ' capacidades alcanzadas, ' +
        hitCritico.length + ' de ellas críticas. ' +
        'El JavaScript del material didáctico actúa con la sesión de quien lo abre.',
      hit,
      hitCritico,
      hitCondicional,
      score: hit.length,
      total,
    };
  }

  // Ninguna crítica, pero sí alguna condicional. No es un escape: el recurso
  // no lee el DOM del anfitrión, ni sus cookies, ni su sesskey, así que el
  // almacenamiento al que llega es el suyo. Tampoco es aislamiento pleno:
  // sigue sin haber origen opaco que lo garantice.
  if (hitCondicional.length > 0) {
    return {
      level: 'warn',
      icon: '⚠',
      title: 'SIN ACCESO AL ANFITRIÓN — capacidades propias disponibles',
      text:
        hit.length + ' de ' + total + ' capacidades alcanzadas, todas ' +
        'condicionales. El recurso no lee el DOM del anfitrión, ni sus cookies, ' +
        'ni su sesskey: el almacenamiento que puede usar es el suyo, no el de la ' +
        'plataforma. Estas capacidades solo serían peligrosas acompañadas de una ' +
        'de las críticas.',
      hit,
      hitCritico,
      hitCondicional,
      score: hit.length,
      total,
    };
  }

  if (result.isOpaqueOrigin) {
    return {
      level: 'good',
      icon: '🛡',
      title: 'AISLADO — origen opaco',
      text:
        '0 de ' + total + ' capacidades alcanzadas. El navegador trata el recurso ' +
        'como un origen ajeno: no hay cookies, ni DOM del padre, ni almacenamiento compartido.',
      hit,
      hitCritico,
      hitCondicional,
      score: 0,
      total,
    };
  }

  return {
    level: 'warn',
    icon: '⚠',
    title: 'CONTENIDO, PERO SIN ORIGEN OPACO',
    text:
      '0 de ' + total + ' capacidades alcanzadas, pero el aislamiento lo aporta la ' +
      'política de mismo origen del navegador, no un sandbox de origen opaco. Si el ' +
      'contenido se sirviera desde el origen del anfitrión, estos valores cambiarían.',
    hit,
    hitCritico,
    hitCondicional,
    score: 0,
    total,
  };
}
