# `suite-src/` — generador de `evil.elpx`

Genera el artefacto principal de la batería (`../evil.elpx`, 21 páginas) a partir de un
*spec* declarativo (`spec.json`), invocando **la CLI real de eXeLearning** para producir
un `.elpx` indistinguible de uno hecho a mano en el editor — no un ZIP hecho a pulso.

## Ficheros

| Fichero | Qué hace |
|---|---|
| `spec.json` | *Spec* declarativo de las 21 páginas del paquete (Inicio, 7 apartados de nivel superior, 13 subapartados): título, qué prueba cada caso y qué se espera en modo *secure* vs *legacy* |
| `exelib.py` | Construye, desde `spec.json`, un `content.xml` mínimo empaquetado como `.elp` intermedio (no es un ODE 2.0 completo: le faltan DOCTYPE, `xmlns`/versión y algunos recursos que el exportador ya no produce, pero el importador de la CLI lo tolera) |
| `render-medicion-fragment.py` | Expone a `poc/build.sh` el mismo CSS y el mismo HTML estático de medición de `exelib.py`, para que la tabla de `evil-page.html` y la de la página 1 sean idénticas |
| `build.sh` | Orquesta: `build_pdf.py` → `assets/probe-embed.pdf` → `exelib.py` → `.elp` intermedio → `make export-elpx` de la CLI real → `../evil.elpx` |
| `build_pdf.py` | Genera `assets/probe-embed.pdf` en PDF puro (sin dependencias): una guía de uso real y breve, reproducible en cada build — sustituye al stub de 395 bytes que se commiteaba antes |
| `verify.py` | Comprueba las invariantes del `.elpx` ya construido (páginas, iDevices, assets, vista de la sonda, bundle byte a byte) y sale con 1 y un informe si algo falla — es el test de esta tarea: no hay pytest en el repositorio |
| `assets/` | Los assets propios del paquete usados en los Casos 2.3, 3.2 y 3.3: `probe-asset.css`, `probe-asset.svg`, `probe-asset.woff`, `probe-local.mp4`, y `probe-embed.pdf` (generado por `build_pdf.py`, no editado a mano) |

## Mapa de casos (`spec.json`)

Una página de aterrizaje (Inicio) y siete apartados de nivel superior; tres de estos
últimos (2, 3 y 5) se dividen en subapartados anidados (`children` en `spec.json`) que
eXeLearning lista en su propia navegación izquierda — este `README`, como el paquete, no
reproduce esa navegación, solo su contenido.

| # | Apartado | Qué prueba |
|---|---|---|
| — | Inicio | La página de aterrizaje de la maqueta de diseño (kind `inicio` en su `NAV`), que la tarea 24 se había saltado. Lleva sonda en vista `linea` aunque la maqueta no la dibujara bajo `isInicio`: `index.html` es lo que incrustan en su iframe las cuatro integraciones, así que una portada sin medir dejaba la primera pantalla en blanco |
| 1 | Resultado de la medición | El veredicto conjunto del paquete y el detalle de las diez comprobaciones; único apartado con la tabla nativa de la sonda (`view: "medicion"`, sin panel ni Shadow DOM) |
| 2 | Vídeos | Introducción a los cuatro subapartados de vídeo |
| 2.1 | Vídeo de YouTube | Embed cross-origin canónico (`youtube-nocookie.com`): que el aislamiento no rompa un vídeo legítimo |
| 2.2 | Vimeo y Dailymotion | Dos proveedores con distinta política de `frame-ancestors` en la misma página; también sirve de caso de estrés |
| 2.3 | Vídeo interactivo con archivo propio | El iDevice `interactive-video` real, apuntando a un `.mp4` del propio paquete: audita la vía de servido del plugin con media pesada |
| 2.4 | Vídeo interactivo con YouTube | El mismo iDevice contra un vídeo cross-origin, para separar «falla el iDevice» de «falla el servido local» |
| 3 | Imágenes y archivos | Introducción a los cuatro subapartados de imágenes y documentos |
| 3.1 | Imagen enlazada de otro sitio | Una imagen de verdad ajena al paquete (Wikimedia Commons), nunca copiada a él |
| 3.2 | Imagen integrada en el paquete | La vía de servido **propia del paquete**: imagen y fondo CSS son del propio `.elpx`, así que aquí sí puede afirmarse *carga real* |
| 3.3 | PDF y fichero fuente | Una guía de uso real en PDF (generada por `build_pdf.py`, no commiteada), la fuente tipográfica propia del paquete, y el iDevice nativo `download-source-file` para el fichero .elp |
| 3.4 | PDF remoto | El documento de demostración oficial de Mozilla PDF.js, servido como `application/pdf` con CORS, en `<object>` más un enlace visible: separa compatibilidad de incrustación (`object-src`/cabeceras del remoto) de disponibilidad por navegación |
| 4 | Iframe genérico | El embed que un modo seguro degradaría a *placeholder*, sin romper el resto de la página |
| 5 | Escalada LMS/CMS | Introducción a los cinco subapartados de acciones/medidas por anfitrión, con su índice de tarjetas |
| 5.1 | Moodle | Demostraciones reversibles de la pestaña Demostración con Moodle seleccionado, más una medida de escalada (ver más abajo) |
| 5.2 | WordPress | Ídem con WordPress, más dos medidas de escalada (ver más abajo) |
| 5.3 | Omeka S | Ídem con Omeka S, más dos medidas de escalada (ver más abajo) |
| 5.4 | Nextcloud | Ídem con Nextcloud — cuarto anfitrión, **añadido en la tarea 24**, no estaba en la maqueta de diseño |
| 5.5 | Servidor genérico | Sin demostraciones: solo mide tres capacidades (ver más abajo) |
| 6 | Ejemplos de impacto | Qué vería una persona usuaria si el contenido fuese malintencionado (vitrina de impacto, ver más abajo) |
| 7 | Cómo interpretar los resultados | Cómo leer el veredicto y qué medidas lo corrigen |

Cada página lleva **varios** bloques `text` nativos, no uno solo con todo inyectado: la
tarea 25 rehizo el contenido para que cada `<article>` de la maqueta de diseño
(`.superpowers/sdd/2026-07-25-exe-probe-suite/diseno-maqueta.html`) sea su propio iDevice,
con su propio icono y su propio título — antes (tarea 24) cada página llevaba un único
bloque `case` con un icono genérico, que es justo lo que `verify.py` comprueba ahora que no
vuelva a pasar. Los tipos de bloque que `spec.json` usa son:

| Tipo | Qué es | Dónde aparece |
|---|---|---|
| `article` | Prosa libre: párrafos + tabla/lista/callout opcionales; `"childrenGrid": true` añade el índice de tarjetas de una sección-hub | Apartado 1, cada «sección» (2, 3, 5), los dos artículos del apartado 7 |
| `caseIntro` | «Qué se prueba aquí» + tabla de lo esperado en modo *secure*/*legacy* | Primer artículo de cada Caso (2.1-2.4, 3.1-3.4, 4) |
| `caseMedia` | La media del caso (icono `observe`, título específico) | Segundo artículo de cada Caso |
| `escapeIntro` | «Qué se prueba aquí» + aviso de que ninguna acción se ejecuta sola | Primer artículo de cada subapartado 5.1-5.5 |
| `actions` | Intro + marcador `data-exe-probe-demo-host` que la sonda rellena con los botones reales | Segundo artículo de 5.1-5.4; único artículo del apartado 6 |
| `downloadSource` | El iDevice nativo `download-source-file` (sin datos en `spec.json`: título/autor/licencia salen de las propiedades del propio `spec.json`) | Tercer bloque de 3.3 |
| `intro` | Dos párrafos, un aviso ámbar intercalado y un tercer párrafo de cierre | Único bloque de este tipo: «Para qué sirve este paquete», primer artículo de Inicio |
| `toc` | La tabla Apartado / Qué encontrará, sin datos propios en `spec.json` | Único bloque de este tipo: «Cómo está organizado», segundo artículo de Inicio |
| `probe` | La sonda misma (`poc/probe/dist/probe.bundle.js`, leída byte a byte en cada `build.sh`), precedida del aviso estático de «no se ejecutó» que ella misma retira al montar | Último bloque de las 21 páginas, Inicio incluida |
| `interactiveVideo` | Un iDevice `interactive-video` real | Casos 2.3 y 2.4, como bloque adicional |

El índice de tarjetas de una sección-hub (`childrenGrid`) enlaza cada tarjeta con
`href="exe-node:<pid>"` — el protocolo nativo de eXeLearning para enlaces internos
(`PageRenderer.replaceInternalLinks()` lo resuelve contra el pid real de cada página al
exportar, la misma resolución que usa la propia navegación de la CLI), nunca una ruta de
archivo adivinada. Para que el pid de un hijo exista a tiempo de construir la tarjeta de su
padre, `emit_page()` reserva los pids de todos los hijos de una página antes de construir
los bloques propios de esa página, no al recorrerlos.

Ninguno de estos renderizadores dibuja un `<h2>` dentro de su HTML: el título del artículo
ya lo pinta eXeLearning solo, a partir del `icon`/`block_name` nativos del propio iDevice
(`block()` en `exelib.py`) — repetirlo dentro habría duplicado la cabecera.

El bloque `toc` de Inicio no lleva filas escritas a mano: `toc_idevice()` las deriva de
`spec["pages"]` (título + un campo `"summary"` nuevo en cada apartado de nivel superior),
así que la tabla no puede desincronizarse de la estructura real — si un apartado se añade,
se quita o se reordena en `spec.json`, la tabla lo sigue sola.

## La vista de la sonda: `medicion`, `línea` y `completo`

La reestructuración central de la tarea 24 fue línea/completo; el fix round de la tarea 25
añadió `medicion` porque el usuario pidió explícitamente que el apartado 1 fuera «una tabla
dentro del iDevice de texto, más nativa, no flotante». La sonda
(`poc/probe/src/entry/probe.js`) admite tres vistas, elegidas por cada página con
`window.__EXE_POC_VIEW`:

- **`medicion`** — sin panel, sin Shadow DOM: `startProbe()` rellena con
  `poc/probe/src/ui/medicion-view.js` (createElement/textContent, nunca innerHTML) el HTML
  estático que `exelib.py` ya generó dentro del propio iDevice — la caja de veredicto y la
  tabla de las diez comprobaciones, con la columna «Valor obtenido» redactada (presencia,
  longitud o recuento; nunca el valor — ver más abajo). Solo lo pide el Apartado 1.
- **`completo`** — el panel de siempre, con sus tres pestañas (Resumen, Detalle,
  Demostración), en Shadow DOM. Ninguna página del paquete lo pide ya, pero se conserva
  como comportamiento por defecto (ver abajo).
- **`línea`** — un resumen compacto en el flujo de la página, **sin panel y sin Shadow
  DOM**: el mismo veredicto (icono, título y `n de 10`) que calcularía la vista completa,
  sin pestañas ni tabla, con un puntero al Apartado 1 para el detalle. Lo piden los otros
  18 apartados. `mountLineaInline()` lo escribe dentro del `<div data-exe-probe-linea>`
  que `exelib.py` emite con el aviso de «no se ejecutó» (ver más abajo), retirando ese
  aviso solo después de haber pintado. Montarlo en un panel, como hacía antes, duplicaba
  el título —el del iDevice y el de la cabecera del panel— y colgaba controles de flotar y
  minimizar de una sola línea de texto. Si ese contenedor no existe (un embebido que fije
  `__EXE_POC_VIEW='linea'` sin el HTML del generador), cae al panel: el artefacto nunca se
  queda mudo.

`exelib.py` emite `window.__EXE_POC_VIEW` como un `<script>` propio, antes del
`__EXE_POC_BUILD_ID` y del bundle, a partir del campo `"view"` de cada bloque `probe` en
`spec.json` (por defecto `"linea"` si se omite). Un valor ausente o desconocido de
`__EXE_POC_VIEW` se trata siempre como `completo`, así que nada que ya embeba el bundle
sin fijar la variable cambia de comportamiento. `verify.py` comprueba, página por página,
que el valor emitido es el esperado, y que el apartado 1 trae sus diez filas en el orden de
`poc/probe/src/core/capabilities.json`.

Ninguna vista implica una medida que otra no haya hecho también: las tres pintan
exactamente el mismo `verdict` que calcula `computeVerdict(result)` — no hay una medición
«ligera» distinta según la vista.

El título nativo del bloque en esos 18 apartados es **«Aislamiento en esta página»**, no
«Resumen de la sonda»: el veredicto es idéntico en las 21 páginas (misma `measure(win)`,
misma vía de servido), así que este bloque no resume nada que el Apartado 1 no diga mejor.
Lo que sí aporta, y solo él, es **si la sonda llegó a correr en esa página** — que es justo
lo que se audita en los Casos 2.3 (vídeo local del paquete) y 3.2 (imagen del paquete),
donde lo que se está midiendo es la vía de servido.

### Si la sonda no corre: el aviso es el estado estático, no la tabla

Las 21 páginas con sonda emiten el HTML **al revés** de lo que parecería natural: lo
estático y visible es un aviso de que no hubo medición, y lo que la sonda hace al montar es
**revelar** la medición (`hidden` fuera) y retirar el aviso. Antes, el Apartado 1 emitía la
tabla ya visible con `—` en cada celda; si el script no corría, esa tabla de guiones se leía
como una medición que salió vacía, no como una que no llegó a hacerse.

No se usa `<noscript>` porque solo cubre «JavaScript desactivado» y deja fuera los dos casos
que este paquete existe para medir: que la política de contenidos del anfitrión bloquee el
`<script>` inline, y que el bundle falle. En esos dos, `<noscript>` sigue oculto.

Revelar es el **último** paso del rellenado (`revelarMedicion()` en `medicion-view.js`,
`mountLineaInline()` en `probe.js`), así que un fallo a mitad falla cerrado: lo que queda en
pantalla sigue diciendo que no hubo medición. Se usa el atributo `hidden` y no una clase
para que el fallback sobreviva a que un tema descarte el `pp_extraHeadContent`
(`[hidden]{display:none}` vive en la hoja de estilos del navegador). **Invariante:** ninguna
regla de `SUITE_CSS` puede fijar `display` sobre `[data-exe-probe-medido]`, `.probe-table`
ni `.probe-noscript`, o anularía ese `hidden`.

### Críticas y condicionales: no todas las diez acusan lo mismo

`capabilities.json` marca cada vector con `"severidad"`, el campo que sustituyó a
`"peligrosa"` (que valía `true` en las diez entradas y no lo leía nadie — un campo constante
no distingue nada). La tabla del Apartado 1 los agrupa en dos `<tbody>`, sin reordenar nada:
las siete críticas ya venían primero y las tres condicionales después.

- **`critica`** (7) — `sandboxAllowsSameOrigin`, `canAccessParent`, `canReadParentDocument`,
  `canReadParentCookie`, `canFindSesskey`, `canFindCourseEditForms`,
  `canFindCourseEditLinks`. Alcanzarlas **es** alcanzar la sesión de quien abre el recurso.
  Su celda «Resultado» dice `Alcanzado` / `Bloqueado`.
- **`condicional`** (3) — `canCallScormApi`, `canUseLocalStorage`, `canUseSessionStorage`.
  Son las capacidades que el contenido legítimo **necesita**: la API SCORM que el modo
  seguro conserva por el puente `postMessage` validado, y el almacenamiento del propio
  documento. `measure.js` mide los dos almacenamientos sobre `w`, la ventana de la **sonda**,
  no sobre la del anfitrión: `true` significa «este documento tiene un almacenamiento
  utilizable», y solo significa «comparte el del anfitrión» cuando además alguna crítica es
  `true`. Su celda dice `Disponible` / `No disponible`, en ámbar y no en el rojo de
  `is-alcanzado` — pintar «Disponible» en rojo sería la misma acusación con otra palabra.

`computeVerdict()` gana por esto una rama: **ninguna crítica pero alguna condicional** ya no
es `☠ SIN AISLAMIENTO — el recurso alcanza el anfitrión`, sino
`⚠ SIN ACCESO AL ANFITRIÓN — capacidades propias disponibles`. El caso es real y trivial de
alcanzar: abrir el `.elpx` exportado como fichero suelto da `2 de 10` (los dos
almacenamientos), y el veredicto anterior afirmaba un escape que no existía. También lo daría
un contenido servido desde un origen distinto pero no opaco.

**El marcador de 10 no cambia.** `CORE_VECTORS` sigue siendo el mismo literal congelado, y
`score`/`total`/`hit` conservan forma y valor: «n de 10» sigue siendo comparable con los
`evidencias/resultados-*.json` ya publicados. Se comprobó que en todos ellos las
configuraciones con condicionales en `true` tienen también alguna crítica en `true`, así que
la rama nueva no altera ningún veredicto publicado. `verdict.js` deriva
`CRITICAL_VECTORS`/`CONDITIONAL_VECTORS` de `capabilities.json` —único sitio donde se decide
la severidad— y `verdict.test.js` comprueba que las dos parten `CORE_VECTORS` sin solapes ni
sobrantes.

### La columna «Valor obtenido»: presencia, longitud o recuento — nunca el valor

`measure.js` añade tres campos, solo añadidos (nunca sustituyen al contrato congelado de 27
claves): `sesskeyLength` (longitud del sesskey/nonce, nunca su contenido),
`parentCookieCount` y `parentCookieSessionLikeCount` (cuántas cookies hay y cuántas
*parecen* de sesión por su nombre, nunca sus nombres ni sus valores). La tabla nativa los usa
para escribir «presente · 10 caracteres» o «4 cookie(s), 1 de sesión» en vez de un valor real
o incluso difuminado — la maqueta de diseño propone `filter: blur(...)` con una nota para
pasar el cursor por encima; se descartó deliberadamente, porque el valor seguiría en el DOM,
en el código fuente de la página y en cualquier captura de pantalla. `checks-view.js` lleva
además una segunda barrera, independiente de `measure.js`: nunca imprime el contenido real de
`parentCookieValue`/`sesskeyValue` (y sus dos campos hermanos), pase lo que pase en `result`.

## La cinta de identidad y la cabecera de caso

Todas las páginas llevan la misma cinta (`identity_strip()` en `exelib.py`):
**«RECURSO DE PRUEBA DE SEGURIDAD — no es material didáctico real»**, seguida del build
id, la fecha y su hash. No es un `<article>` de la maqueta, así que tampoco es su propio
iDevice: `emit_page()` la antepone al contenido del primer bloque de texto de cada página,
sea cual sea su tipo. Cada caso lleva además su propia tabla de lo esperado (`caseIntro`
en `exelib.py`, primer artículo de la página): qué prueba, qué se espera en modo *secure*
y qué se espera en modo *legacy* — en texto plano, para que quien abra el paquete sepa qué
está viendo sin tener que leer el código —, y su segundo artículo (`caseMedia`) añade,
cuando la media es de un tercero, una línea de **atribución** (licencia y autoría) si el
caso declara `"attribution"` en `spec.json`. `verify.py` comprueba, por página, que el
número de bloques, sus iconos y sus títulos nativos coinciden con el mapa de artículos, y
que las cadenas de «Esperado en modo seguro» siguen presentes en cada Caso.

## `frame-no-bloqueado` frente a `carga-real`

El panel (`poc/probe/src/core/media.js`) distingue dos afirmaciones sobre la media
medida, y no las mezcla:

- **`frame-no-bloqueado`** — lo máximo que puede afirmarse de un `<iframe>`/`<object>`
  cross-origin: el navegador no bloqueó el frame y este ocupa su caja. No puede
  afirmarse que el vídeo *reproduzca*, porque en cross-origin el navegador no expone
  ese estado. Se aplica a los Casos 2.1, 2.2, 3.4 y 4.
- **`carga-real`** — el navegador expone una señal directa de carga (`naturalWidth`,
  `document.fonts.check`, `readyState`…), así que sí puede afirmarse que el asset se
  sirvió correctamente. Se aplica a los Casos 3.1, 3.2, a la fuente del 3.3 y al `<video>` local del
  Caso 2.3. El Caso 3.1 es la excepción deliberada: su imagen **no** es un asset del
  paquete (viene enlazada de Wikimedia Commons, sin `_bind_asset`), pero la señal
  `naturalWidth`/`complete` de un `<img>` es igual de fiable venga el archivo de dentro
  o de fuera del paquete — a diferencia de un iframe, que no expone su estado interno en
  cross-origin. Lo que cambia entre el Caso 3.1 y el 3.2 es de dónde viene el byte, no
  si la medida es honesta.

El Caso 3.4 usa la primera categoría: un `<object>` cross-origin solo permite afirmar
que el navegador no bloqueó su caja, no que el visor PDF haya renderizado. Por eso lleva
además un enlace visible al mismo PDF. Si el `<object>` falla pero el enlace abre, la
diferencia es de política de incrustación (`object-src`, `frame-ancestors`,
`X-Frame-Options` o `Content-Disposition`), no de disponibilidad del documento ni de
aislamiento frente al LMS.

**Matiz importante para los Casos 2.3 y 2.4:** el panel solo mide el `<video>` que él
mismo inserta como control (el del bloque `case`), no el vídeo que crea en tiempo de
ejecución el propio iDevice `interactive-video`. En el Caso 2.3 el panel puede afirmar
*carga-real* de su `<video>` de control, pero que el iDevice se reproduzca y responda a
las diapositivas es una comprobación **visual**, no medida por el panel. En el Caso 2.4,
al ser todo cross-origin (YouTube), no hay ninguna medida de *carga-real* posible:
*frame-no-bloqueado* es la única afirmación honesta, y de nuevo el propio reproductor del
iDevice se verifica a ojo, no por el panel.

## Apartado 5: escalada LMS/CMS (renombrado en el fix round de la tarea 25)

Los subapartados 5.1-5.4 (Moodle, WordPress, Omeka S, Nextcloud) llevan sus botones
**en la propia página**, en su artículo «Acciones disponibles» (bloque `actions` en
`spec.json`). `spec.json` no lista ahí los títulos o descripciones de cada acción — eso
viviría desincronizado de `poc/probe/src/hosts/*.js` en cuanto alguien cambiara una demo —
solo un `intro` y el anfitrión (`"host": "moodle"`, etc.). `exelib.py` traduce eso a un
`<div data-exe-probe-demo-host="moodle">` en el HTML; la propia sonda
(`poc/probe/src/entry/probe.js:mountInlineDemoHosts`) encuentra ese marcador al arrancar y
monta ahí, con `demos-view.js:mountInlineDemos`, la misma UI de botón + chip de tres
estados (`demoBlock`) y el mismo `demo.run()` que la pestaña Demostración del panel usa en
su Shadow DOM — una acción se comporta igual se dispare desde donde se dispare, y no hay
una segunda vía de reporte. Nextcloud es la incorporación de la tarea 24: la maqueta de
diseño solo contemplaba Moodle/WordPress/Omeka, pero la sonda ya cubre cuatro anfitriones
reales y el artículo reclama esa cobertura — omitirlo del paquete habría sido una
regresión silenciosa.

**Tarea 26b** — la maqueta de diseño original proponía una cuarta acción en Moodle
(matricular a la persona conectada en un curso ajeno) y una tercera y cuarta en WordPress
(activar un plugin ya instalado, crear una cuenta con permisos de administración) y en
Omeka S (modificar los metadatos de un ítem existente, conceder un permiso de
colaboración). Ninguna de las cinco se implementa como demo: un artefacto que matricula,
activa plugins, crea cuentas con privilegios o concede permisos de verdad, por reversible
que sea, es una herramienta de escalada, no un instrumento de medición, sea cual sea la
intención de quien lo publique. En su lugar se añadieron cinco **medidas booleanas**, la
misma disciplina que ya seguían las tres del 5.5 (detectar, nunca intentar):

- `moodleEnrolReachable` (`poc/probe/src/hosts/moodle.js`) — ¿hay un enlace o un
  formulario de matriculación (`/enrol/…`) referenciado en el DOM del padre?
- `wpPluginAdminReachable` y `wpUserCreateReachable` (`poc/probe/src/hosts/wordpress.js`)
  — ¿están enlazadas la pantalla de administración de plugins y la de alta de usuarios,
  por su URL de wp-admin o por su ruta REST?
- `omekaMetadataEditReachable` y `omekaPermissionsReachable`
  (`poc/probe/src/hosts/omeka.js`) — ¿están enlazadas la edición de un ítem y los
  permisos del sitio?

Las cinco son lectura del DOM, nunca una petición ni un envío de formulario; bajo origen
opaco las cinco dan `false` (`poc/probe/test/{moodle,wordpress,omeka}.test.js`). Se
muestran en el panel junto al resto de vectores del anfitrión — fuera del marcador de 10,
igual que las tres del 5.5 — y la prosa de 5.1-5.3 en `spec.json` dice sin rodeos qué se
mide y por qué no se ejecuta (`poc/suite-src/verify.py:ESCALATION_MEASURE_PROSE` lo
comprueba contra el artefacto exportado).

El 5.5 (servidor genérico) es distinto a propósito. La maqueta de diseño proponía ahí dos
acciones — «registrar las pulsaciones del teclado» y «enviar el contenido de la página a
otro servidor» — que cruzan la línea que hace publicable este instrumento: la sonda mide,
nunca exfiltra. Se implementaron en su lugar como tres **medidas de capacidad
booleanas**, añadidas a `poc/probe/src/hosts/generic.js` (el adaptador por defecto, el que
gana cuando hay acceso al padre pero ese padre no es ninguna de las cuatro plataformas
conocidas):

- `genericCookiesReadable` — ¿son legibles las cookies del documento del anfitrión? Se
  comprueba solo la presencia (`typeof pd.cookie === 'string'`), nunca su valor.
  `poc/probe/test/generic.test.js` comprueba que el valor de una cookie de prueba nunca
  aparece en el JSON de las medidas.
- `genericKeyboardHookInstallable` — ¿puede instalarse un manejador de teclado? Se
  instala uno vacío y se retira en el mismo tick (igual que `measure.js` abre y cierra un
  popup 1×1): demuestra la capacidad sin que el manejador llegue a ejecutarse ni a leer un
  solo evento.
- `genericExternalConnectReachable` — ¿dejaría pasar el navegador una conexión saliente?
  Se detecta si `fetch` existe y si no hay una política de contenidos declarada en `<meta>`
  que restrinja `connect-src`; nunca se hace una petición real, así que no sale un solo
  byte por la red.

Las tres siguen la misma disciplina que el resto de `measure.js`: capacidad detectada,
nunca intentada. `generic.demos` sigue vacío — este anfitrión mide, no actúa.

## Ejemplos de impacto (Apartado 6) y sus cuatro reglas

Cinco demostraciones (`poc/probe/src/hosts/showcase.js`), accesibles tanto desde la pestaña
Demostración de la sonda como directamente en el único artículo de esta página («Qué vería
la persona usuaria», bloque `actions` con `"host": "showcase"` — el mismo mecanismo que
5.1-5.4, aplicado a la vitrina en vez de a un anfitrión), de lo que podría hacer contenido
no aislado si consiguiera
pintar sobre el DOM del anfitrión: **voltear la página** (espejo horizontal), **tomar la
pantalla completa** con una animación tipo *terminal* y un aviso parpadeante, **pintar
una ventana de identificación falsa** (servicio inventado, `CorreoNube 98`; campos de
solo lectura cuyo `.value` no se lee en ningún punto del código; aviso de «demostración,
no se ha capturado nada» al primer foco, tecleo o envío), **sustituir el logotipo de la
institución** (busca la imagen de cabecera del anfitrión y le cambia el `src` por una
imagen propia generada al vuelo, sin tocar el archivo original) y **mostrar un aviso de
mantenimiento falso** (una franja superpuesta con aspecto de mensaje oficial de la
plataforma, sin nombrar ninguna marca ni institución real). Las cinco comparten cuatro
reglas:

1. **Ninguna hace red.**
2. **Ninguna persiste** nada tras recargar la página.
3. **Todas se deshacen con un clic** (botón «Quitar» en su propia cinta).
4. **Todas se auto-retiran solas** al vencer el plazo (60 s).

Bajo origen opaco (modo *secure*) las cinco devuelven `BLOQUEADO`: sin acceso al `document`
del padre, no hay DOM del anfitrión sobre el que pintar.

## CSS compartida vía `pp_extraHeadContent`

El fix round de la tarea 25 sacó la presentación repetida de los `style="…"` en línea de
cada función de `exelib.py` a una única hoja de estilos, `SUITE_CSS`, inyectada una sola vez
mediante `<odeProperty><key>pp_extraHeadContent</key>…` en `odeProperties`. Es un mecanismo
real de eXeLearning (`Html5Exporter.ts`/`ElpxExporter.ts`: `meta.extraHeadContent` se vuelca
dentro de `<head>` en `renderHead()`), no un truco — el usuario pidió explícitamente usar
«el campo css adicional que para eso está», y así es. Los estilos que quedan en línea en el
HTML que genera `exelib.py` son solo los que la propia CLI exige en ese punto (p. ej. el
`style="text-align: center"` que copia el fixture real de `download-source-file`); ninguno
es un valor calculado por Python. Las clases que rellena la sonda en tiempo de ejecución
(color del veredicto, estado de cada fila) se aplican con `classList`, nunca con
`style.cssText`, para que compartan la misma hoja.

## `download-source-file` (Caso 3.3) y el hallazgo sobre `exportSource`

`download_source_file_idevice()` en `exelib.py` reproduce el iDevice nativo de descarga del
fichero fuente, con la forma exacta (`jsonProperties` vacío, `htmlView` con los marcadores
`exe-package:elp`/`exe-package:elp-name`) copiada del único fixture real que lo usa
(`exelearning_5/test/fixtures/export/un-heroe-medieval-el-cid/…_elpx/content.xml`). La CLI
resuelve esos marcadores al exportar: el botón dispara un manejador cliente
(`libs/exe_elpx_download`, incluido automáticamente en cuanto detecta el iDevice) que lee
`window.__ELPX_MANIFEST__` y re-empaqueta esos ficheros en un `.elpx` descargado al vuelo.

**`exportSource` (que este generador ya fija a `true` sin condiciones) no tiene ninguna
relación con ese botón.** Se comprobó directamente contra `ElpxExporter.ts` — el exportador
que usa `make export-elpx FORMAT=elpx`, no `Html5Exporter.ts`, cuyo formato `_web` es
distinto y sí condiciona `content.xml` a `exportSource` — y la lista de ficheros del
manifiesto (`fileList`) se construye y se escribe en `libs/elpx-manifest.js` *antes* de que
`content.xml` y el DTD se añadan al ZIP final, mediante una llamada a la API de zip cruda
que nunca pasa por el envoltorio que alimenta esa lista. Consecuencia verificada
empíricamente (el manifiesto que produce este propio `build.sh` lista 200 ficheros, ninguno
`content.xml` ni `content.dtd`): el `.elpx` que escribe `build.sh` es completo y
re-importable; el ZIP que ese botón reconstruye *desde dentro de una página en ejecución*
no lo es — le falta `content.xml`, así que eXeLearning no podría reimportarlo. Es una
limitación del propio exportador de eXeLearning, no algo que `spec.json`/`exelib.py` puedan
corregir.

## Regenerar

```bash
cd poc/probe && npm install && npm run build   # solo si cambian las fuentes de la sonda;
                                                # dist/ ya está commiteado, así que normalmente se salta
cd poc/suite-src
bash build.sh          # escribe directamente ../evil.elpx
python3 verify.py      # valida ../evil.elpx (target por defecto); sale 1 y explica si falla
```

`build.sh` necesita **Python 3** (`exelib.py` importa además el paquete `markdown` de
PyPI para un tipo de bloque que este `spec.json` no usa, pero que el módulo carga igual;
instálalo si tu Python no lo trae), **bash**, y sobre todo **un checkout local de la CLI
real de eXeLearning** — es esta CLI, no `exelib.py`, quien emite el `.elpx` final
(tema, iDevices, navegación y HTML exportado); el `.elp` que produce `exelib.py` es solo
un intermedio que la CLI reimporta. Por defecto `build.sh` busca esa CLI en
`EXE_DIR=/Users/ernesto/Downloads/git/exelearning_5` (una ruta local del autor, no
distribuida en este repositorio); apunta `EXE_DIR=/ruta/a/tu/checkout/exelearning_5` al
tuyo. `verify.py` en cambio solo necesita la biblioteca estándar de Python 3 y el
`.elpx` ya construido — no toca la CLI ni la sonda.

Esta es la razón de que `poc/probe/dist/probe.bundle.js` esté commiteado: sin él,
regenerar `evil.elpx` exigiría además Node/`npm` solo para producir un fichero
que casi nunca cambia entre una regeneración y la siguiente.
