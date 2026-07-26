/*
 * Catálogo de ayuda por comprobación: qué mide, qué implica el valor, de qué
 * protege el aislamiento y dónde leer más. Sin esto, `canFindSesskey: true` no
 * significa nada para quien mira el panel.
 *
 * `texto` es la descripción en lenguaje llano de qué ha intentado el
 * contenido — el estilo de la maqueta de diseño
 * (.superpowers/sdd/2026-07-25-exe-probe-suite/diseno-maqueta.html, array
 * CAPACIDADES: «Leer las cookies de sesión de esa página» en vez del nombre
 * de la clave — que checks-view.js pinta ahora como etiqueta principal de
 * cada fila, con la clave técnica relegada a la caja de ayuda ⓘ. Nunca
 * incluyas aquí, ni en ningún otro campo de esta tabla, un valor de ejemplo
 * que se parezca a una cookie o un sesskey reales — los de la maqueta
 * (`MoodleSession=k3f9a1c2e7b4`, `8Kd2mQpTvA`) son marcadores de un
 * prototipo estático, nunca texto a reproducir literal.
 *
 * Para los diez vectores de CORE_VECTORS, `texto`/`prop`/`mide`/`implica`/
 * `protege`/`doc` NO se declaran aquí dos veces: vienen de capabilities.json,
 * la misma fuente que exelib.py lee en Python para construir la tabla estática
 * del apartado 1 (poc/suite-src/exelib.py:load_capabilities). Un solo
 * fichero, dos consumidores — así no puede desincronizarse la descripción
 * que ve quien lee el JS de la que ve quien lee el HTML exportado.
 */
import CAPABILITIES from '../core/capabilities.json';

export const DOC_BASE =
  'https://github.com/erseco/lms-untrusted-content-security-paper/blob/main/';

export { CAPABILITIES };

// Entradas que no son filas del apartado 1 (panel Detalle, anfitrión, media…).
// Las diez de CORE_VECTORS se rellenan desde capabilities.json más abajo.
export const HELP = {
  canRunJavascript: {
    texto: 'Ejecutar el JavaScript que trae el propio contenido.',
    mide: 'Si el navegador ejecuta el JavaScript que viaja dentro del recurso.',
    implica: 'Casi siempre verdadero. Aislar no consiste en prohibir JS, sino en limitar su alcance.',
    protege: 'Nada por sí solo: es la línea base sobre la que se miden las demás pruebas.',
    doc: 'matriz-seguridad.md',
  },
  isOpaqueOrigin: {
    texto: 'Comprobar si el navegador sirve este contenido en un origen opaco.',
    mide: 'Si el documento se sirve en un origen opaco (window.origin === "null"): iframe con sandbox sin allow-same-origin.',
    implica: 'Verdadero es el valor seguro: el navegador trata el recurso como un origen ajeno a todo lo demás.',
    protege: 'Lectura de cookies y DOM del anfitrión, uso de la sesión del usuario y acceso a su almacenamiento.',
    doc: 'anexo-modo-siempre-opaco.md',
  },
  sandboxAttr: {
    texto: 'Consultar con qué permisos le sirvió el iframe la plataforma.',
    mide: 'El atributo sandbox del iframe, cuando el navegador permite leerlo.',
    implica: 'Puede aparecer como «unreadable» precisamente porque hay aislamiento entre orígenes: eso es buena señal.',
    protege: 'No protege por sí mismo; documenta con qué permisos se sirvió el recurso.',
    doc: 'REPRODUCIBILITY.md',
  },
  canAccessTop: {
    texto: 'Alcanzar la ventana principal, primer paso para poder redirigirla.',
    mide: 'Si puede leer propiedades protegidas de window.top. No intenta navegarla.',
    implica: 'Falso es el valor seguro dentro de un iframe.',
    protege: 'Redirección de la ventana completa a un sitio controlado por quien escribió el material.',
    doc: 'matriz-seguridad.md',
  },
  canOpenPopups: {
    texto: 'Abrir ventanas emergentes.',
    mide: 'Abre y cierra al instante una ventana about:blank de 1×1 para comprobar si los popups están permitidos.',
    implica: 'Informativo. Sin allow-popups el sandbox los bloquea.',
    protege: 'Ventanas emergentes de phishing lanzadas desde el material.',
    doc: 'anexos-tecnicos.md',
  },
  canUsePostMessage: {
    texto: 'Enviar mensajes a la ventana que lo aloja.',
    mide: 'Si postMessage está disponible. La sonda no envía ningún mensaje.',
    implica: 'Informativo: es una API legítima, segura si el receptor valida origen y datos.',
    protege: 'Nada por sí sola; el riesgo está en un receptor que no valide el origen.',
    doc: 'anexos-tecnicos.md',
  },
  scormApiFlavor: {
    texto: 'Identificar qué variante de la API SCORM está disponible.',
    mide: 'Qué variante de la API SCORM se ha detectado, sin invocarla.',
    implica: 'Informativo. Acompaña a canCallScormApi.',
    protege: 'Nada por sí mismo.',
    doc: 'matriz-seguridad.md',
  },
};

// Fuente única de texto de ayuda para los diez vectores de CORE_VECTORS.
// capabilities.json alimenta también la tabla estática del apartado 1.
for (const c of CAPABILITIES) {
  HELP[c.key] = {
    texto: c.texto,
    prop: c.prop,
    mide: c.mide,
    implica: c.implica,
    protege: c.protege,
    doc: c.doc,
  };
}

export function helpFor(key) {
  return HELP[key] || {
    texto: 'Comprobación adicional del adaptador de anfitrión.',
    mide: 'Comprobación adicional del adaptador de anfitrión.',
    implica: 'Consulta la matriz de seguridad para su interpretación.',
    protege: 'Depende de la plataforma.',
    doc: 'matriz-seguridad.md',
  };
}
