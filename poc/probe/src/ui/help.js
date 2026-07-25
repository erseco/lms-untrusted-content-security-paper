/*
 * Catálogo de ayuda por comprobación: qué mide, qué implica el valor, de qué
 * protege el aislamiento y dónde leer más. Sin esto, `canFindSesskey: true` no
 * significa nada para quien mira el panel.
 */
export const DOC_BASE =
  'https://github.com/erseco/lms-untrusted-content-security-paper/blob/main/';

export const HELP = {
  canRunJavascript: {
    mide: 'Si el navegador ejecuta el JavaScript que viaja dentro del recurso.',
    implica: 'Casi siempre verdadero. Aislar no consiste en prohibir JS, sino en limitar su alcance.',
    protege: 'Nada por sí solo: es la línea base sobre la que se miden las demás pruebas.',
    doc: 'matriz-seguridad.md',
  },
  isOpaqueOrigin: {
    mide: 'Si el documento se sirve en un origen opaco (window.origin === "null"), es decir, dentro de un iframe con sandbox SIN allow-same-origin.',
    implica: 'Verdadero es el valor seguro: el navegador trata el recurso como un origen ajeno a todo lo demás.',
    protege: 'Lectura de cookies y DOM del anfitrión, uso de la sesión del usuario y acceso a su almacenamiento.',
    doc: 'anexo-modo-siempre-opaco.md',
  },
  sandboxAllowsSameOrigin: {
    mide: 'Si el recurso conserva acceso de mismo origen al documento que lo contiene.',
    implica: 'Falso es el valor seguro. Verdadero significa que el sandbox concedió allow-same-origin, o que no hay sandbox.',
    protege: 'Todo lo demás: con mismo origen efectivo, el resto de barreras deja de aplicar.',
    doc: 'anexo-modo-siempre-opaco.md',
  },
  canAccessParent: {
    mide: 'Si puede leer propiedades protegidas de window.parent.',
    implica: 'Falso es el valor seguro. Verdadero es el primer escalón de cualquier ataque contra el anfitrión.',
    protege: 'Lectura y manipulación de la página que embebe el recurso.',
    doc: 'matriz-seguridad.md',
  },
  canReadParentDocument: {
    mide: 'Si puede acceder al DOM del anfitrión.',
    implica: 'Falso es el valor seguro. Verdadero permite leer datos visibles y modificar la interfaz.',
    protege: 'Suplantación de la interfaz, lectura de datos del alumnado, ventanas de identificación falsas.',
    doc: 'matriz-seguridad.md',
  },
  canReadParentCookie: {
    mide: 'Solo si document.cookie del anfitrión es accesible. Nunca muestra ni conserva su contenido.',
    implica: 'Falso es el valor seguro. Verdadero expone la sesión a cualquier script del recurso.',
    protege: 'Robo de sesión y actuación en nombre de quien abre el material.',
    doc: 'anexos-tecnicos.md',
  },
  canFindSesskey: {
    mide: 'Si existe un token de sesión alcanzable en el anfitrión, sin mostrar ni conservar su valor.',
    implica: 'Falso es el valor seguro. Verdadero permite firmar peticiones que el anfitrión aceptará como legítimas.',
    protege: 'CSRF con el token del propio usuario: crear cursos, cambiar perfiles, publicar contenido.',
    doc: 'matriz-seguridad.md',
  },
  canFindCourseEditForms: {
    mide: 'Si el recurso localiza formularios administrativos o de edición en el anfitrión.',
    implica: 'Falso es el valor seguro. Verdadero da al recurso el mapa de qué puede reenviar.',
    protege: 'Reenvío de formularios administrativos con la sesión de la víctima.',
    doc: 'anexos-tecnicos.md',
  },
  canFindCourseEditLinks: {
    mide: 'Si localiza enlaces de edición o administración en la página del anfitrión.',
    implica: 'Falso es el valor seguro. Verdadero revela el nivel de privilegio de quien mira.',
    protege: 'Reconocimiento previo a un ataque dirigido contra cuentas con permisos.',
    doc: 'anexos-tecnicos.md',
  },
  canCallScormApi: {
    mide: 'Si el objeto de la API SCORM es alcanzable. La sonda NO invoca ningún método.',
    implica: 'Falso es el valor seguro. Verdadero permitiría alterar progreso y calificaciones.',
    protege: 'Manipulación de la evaluación desde el propio material didáctico.',
    doc: 'matriz-seguridad.md',
  },
  canUseLocalStorage: {
    mide: 'Si el recurso puede escribir y borrar una clave temporal en localStorage.',
    implica: 'Falso es el valor seguro bajo origen opaco: indica que no comparte almacenamiento con el anfitrión.',
    protege: 'Lectura de datos que el anfitrión guarda en el navegador y persistencia entre sesiones.',
    doc: 'anexo-modo-siempre-opaco.md',
  },
  canUseSessionStorage: {
    mide: 'Si el recurso puede escribir y borrar una clave temporal en sessionStorage.',
    implica: 'Falso es el valor seguro bajo origen opaco, por la misma razón que localStorage.',
    protege: 'Lectura del almacenamiento de sesión del anfitrión.',
    doc: 'anexo-modo-siempre-opaco.md',
  },
  sandboxAttr: {
    mide: 'El atributo sandbox del iframe, cuando el navegador permite leerlo.',
    implica: 'Puede aparecer como «unreadable» precisamente porque hay aislamiento entre orígenes: eso es buena señal.',
    protege: 'No protege por sí mismo; documenta con qué permisos se sirvió el recurso.',
    doc: 'REPRODUCIBILITY.md',
  },
  canAccessTop: {
    mide: 'Si puede leer propiedades protegidas de window.top. No intenta navegarla.',
    implica: 'Falso es el valor seguro dentro de un iframe.',
    protege: 'Redirección de la ventana completa a un sitio controlado por el atacante.',
    doc: 'matriz-seguridad.md',
  },
  canOpenPopups: {
    mide: 'Abre y cierra al instante una ventana about:blank de 1×1 para comprobar si los popups están permitidos.',
    implica: 'Informativo. Sin allow-popups el sandbox los bloquea.',
    protege: 'Ventanas emergentes de phishing lanzadas desde el material.',
    doc: 'anexos-tecnicos.md',
  },
  canUsePostMessage: {
    mide: 'Si postMessage está disponible. La sonda no envía ningún mensaje.',
    implica: 'Informativo: es una API legítima, segura si el receptor valida origen y datos.',
    protege: 'Nada por sí sola; el riesgo está en un receptor que no valide el origen.',
    doc: 'anexos-tecnicos.md',
  },
  scormApiFlavor: {
    mide: 'Qué variante de la API SCORM se ha detectado, sin invocarla.',
    implica: 'Informativo. Acompaña a canCallScormApi.',
    protege: 'Nada por sí mismo.',
    doc: 'matriz-seguridad.md',
  },
};

export function helpFor(key) {
  return HELP[key] || {
    mide: 'Comprobación adicional del adaptador de anfitrión.',
    implica: 'Consulta la matriz de seguridad para su interpretación.',
    protege: 'Depende de la plataforma.',
    doc: 'matriz-seguridad.md',
  };
}
