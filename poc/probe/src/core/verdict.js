/*
 * Veredicto de cabecera. Diez vectores de núcleo, estables entre plataformas,
 * para que el marcador siga siendo comparable con los resultados-*.json ya
 * publicados. sandboxEscape / sandboxEscapeAttempted quedan fuera a propósito:
 * son false por diseño y falsearían el marcador al alza.
 */
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

export function computeVerdict(result) {
  const hit = CORE_VECTORS.filter((k) => result[k] === true);
  const total = CORE_VECTORS.length;

  if (hit.length > 0) {
    return {
      level: 'bad',
      icon: '☠',
      title: 'SIN AISLAMIENTO — el recurso alcanza el anfitrión',
      text:
        hit.length + ' de ' + total + ' capacidades peligrosas alcanzadas. ' +
        'El JavaScript del material didáctico actúa con la sesión de quien lo abre.',
      hit,
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
    score: 0,
    total,
  };
}
