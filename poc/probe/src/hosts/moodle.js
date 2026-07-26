/*
 * Adaptador de Moodle: detección, medidas específicas y demos de escritura.
 * Las demos visuales (voltear, terminal, login falso) NO viven aquí: son
 * independientes de la plataforma y están en hosts/showcase.js.
 */
import { ownUser, createCourse } from './moodle-actions.js';

function signalsOf(ctx) {
  const signals = [];
  const pw = ctx.parentWin();
  const pd = ctx.parentDoc();
  try { if (pw && pw.M && pw.M.cfg) signals.push('window.parent.M.cfg'); } catch (e) { /* ignorado */ }
  if (pd) {
    if (pd.querySelector('input[name="sesskey"]')) signals.push('input[name=sesskey]');
    if (pd.body && /^page-/.test(pd.body.id || '')) signals.push('body#page-…');
    if (pd.querySelector('link[href*="/theme/"], script[src*="/lib/javascript.php"]')) {
      signals.push('assets /theme/ o /lib/');
    }
  }
  return signals;
}

// La matriculación en un curso ajeno era la cuarta acción de la maqueta de
// diseño para Moodle (apartado 5.1 del paquete): añadir y retirar la
// matrícula de la persona conectada en un curso que no es el suyo. No se
// implementa como demo — un paquete que matricula usuarios de verdad, por
// reversible que sea, es una herramienta de escalada, no un instrumento de
// medición. En su lugar, measure() solo comprueba si la superficie de
// matriculación está referenciada en el DOM del padre (un enlace o un
// formulario bajo /enrol/), nunca la envía.
function enrolReachable(pd) {
  return Boolean(pd && pd.querySelector('a[href*="/enrol/"], form[action*="/enrol/"]'));
}

export default {
  id: 'moodle',
  label: 'Moodle',

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
    const pw = ctx.parentWin();
    let cfg = false;
    try { cfg = !!(pw && pw.M && pw.M.cfg && pw.M.cfg.sesskey); } catch (e) { /* ignorado */ }
    return {
      moodleSesskeyReachable: Boolean(cfg || (pd && pd.querySelector('input[name="sesskey"]'))),
      moodleAdminLinksReachable: Boolean(pd && pd.querySelector('a[href*="/admin/"]')),
      moodleEditFormsReachable: Boolean(pd && pd.querySelector('form[action*="modedit"], form[action*="course/edit"]')),
      moodleEnrolReachable: enrolReachable(pd),
    };
  },

  demos: [
    {
      id: 'moodle-own-user',
      label: 'Nombre + foto del usuario',
      icon: '👤',
      persists: true,
      // Forma real de la petición (moodle-actions.js:ownUser), no una
      // inventada: lo que se muestra en la tarjeta es la FORMA, nunca la
      // respuesta real del anfitrión.
      request: 'POST /lib/ajax/service.php?info=core_user_update_users · POST /user/edit.php',
      help: {
        intenta: 'Sustituye al instante el avatar visible del padre y lo resalta en verde; después cambia tu nombre a «PWNED ;)» y la foto persistente, usando la cookie de sesión y el sesskey del padre.',
        protege: 'Con origen opaco no hay cookie ni sesskey alcanzables: la petición ni siquiera se puede firmar.',
        reversion: 'Reversible desde el perfil del usuario. El diario guarda el nombre anterior.',
        doc: 'matriz-seguridad.md',
      },
      run: ownUser,
    },
    {
      id: 'moodle-course',
      label: 'Crear curso + etiqueta + 50 avisos',
      icon: '🏗',
      persists: true,
      request: 'POST /course/edit.php · POST /course/modedit.php?add=label · POST /mod/forum/post.php ×50',
      help: {
        intenta: 'Descarga los formularios de Moodle (que ya traen el sesskey) y los reenvía para crear un curso, una etiqueta y 50 mensajes de foro.',
        protege: 'Es CSRF con el token del propio usuario. Requiere leer el DOM del padre, imposible en origen opaco.',
        reversion: 'Reversible borrando el curso POC-… desde la administración de cursos.',
        doc: 'anexos-tecnicos.md',
      },
      run: createCourse,
    },
  ],
};
