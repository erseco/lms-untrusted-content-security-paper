/*
 * Adaptador de Moodle: detección, medidas específicas y demos de escritura.
 * Las demos visuales (voltear, terminal, login falso) NO viven aquí: son
 * independientes de la plataforma y están en hosts/showcase.js.
 */
import { ownUser, createCourse } from './moodle-actions.js';
import passive from './moodle-passive.js';

// La matriculación en un curso ajeno era la cuarta acción de la maqueta de
// diseño para Moodle (apartado 5.1 del paquete): añadir y retirar la
// matrícula de la persona conectada en un curso que no es el suyo. No se
// implementa como demo — un paquete que matricula usuarios de verdad, por
// reversible que sea, es una herramienta de escalada, no un instrumento de
// medición. En su lugar, measure() solo comprueba si la superficie de
// matriculación está referenciada en el DOM del padre (un enlace o un
// formulario bajo /enrol/), nunca la envía.
export default {
  ...passive,
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
      label: 'Crear curso o foro + 50 avisos',
      icon: '🏗',
      persists: true,
      request: 'POST /course/edit.php · fallback: POST /course/modedit.php?add=forum · POST /mod/forum/post.php ×50',
      help: {
        intenta: 'Intenta crear un curso, una etiqueta y 50 mensajes. Si no puede crear cursos, crea una actividad Foro y las 50 contribuciones en el curso actual.',
        protege: 'Es CSRF con el token del propio usuario. Requiere leer el DOM del padre, imposible en origen opaco.',
        reversion: 'Reversible borrando el curso POC-… o la actividad Foro POC-SAFE del curso actual.',
        doc: 'anexos-tecnicos.md',
      },
      run: createCourse,
    },
  ],
};
