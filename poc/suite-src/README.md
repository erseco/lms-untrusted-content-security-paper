# `suite-src/` — generador de `exe-probe-suite.elpx`

Genera el artefacto principal de la batería (`../exe-probe-suite.elpx`) a partir de un
*spec* declarativo (`spec.json`), invocando **la CLI real de eXeLearning** para producir
un `.elpx` indistinguible de uno hecho a mano en el editor — no un ZIP hecho a pulso.

## Ficheros

| Fichero | Qué hace |
|---|---|
| `spec.json` | *Spec* declarativo de las 20 páginas del paquete (Inicio, 7 apartados de nivel superior, 12 subapartados): título, qué prueba cada caso y qué se espera en modo *secure* vs *legacy* |
| `exelib.py` | Construye, desde `spec.json`, un `content.xml` mínimo empaquetado como `.elp` intermedio (no es un ODE 2.0 completo: le faltan DOCTYPE, `xmlns`/versión y algunos recursos que el exportador ya no produce, pero el importador de la CLI lo tolera) |
| `build.sh` | Orquesta: `exelib.py` → `.elp` intermedio → `make export-elpx` de la CLI real → `../exe-probe-suite.elpx` |
| `verify.py` | Comprueba las invariantes del `.elpx` ya construido (páginas, iDevices, assets, vista de la sonda, bundle byte a byte) y sale con 1 y un informe si algo falla — es el test de esta tarea: no hay pytest en el repositorio |
| `assets/` | Los cinco assets propios del paquete usados en los Casos 2.3, 3.2 y 3.3: `probe-asset.css`, `probe-asset.svg`, `probe-asset.woff`, `probe-embed.pdf`, `probe-local.mp4` |

## Mapa de casos (`spec.json`)

Una página de aterrizaje (Inicio) y siete apartados de nivel superior; tres de estos
últimos (2, 3 y 5) se dividen en subapartados anidados (`children` en `spec.json`) que
eXeLearning lista en su propia navegación izquierda — este `README`, como el paquete, no
reproduce esa navegación, solo su contenido.

| # | Apartado | Qué prueba |
|---|---|---|
| — | Inicio | La página de aterrizaje de la maqueta de diseño (kind `inicio` en su `NAV`), que la tarea 24 se había saltado — sin bloque de sonda, a diferencia de las otras 19 |
| 1 | Resultado de la medición | El veredicto conjunto del paquete y el detalle de las diez comprobaciones; único apartado con el panel de la sonda **completo** |
| 2 | Vídeos | Introducción a los cuatro subapartados de vídeo |
| 2.1 | Vídeo de YouTube | Embed cross-origin canónico (`youtube-nocookie.com`): que el aislamiento no rompa un vídeo legítimo |
| 2.2 | Vimeo y Dailymotion | Dos proveedores con distinta política de `frame-ancestors` en la misma página; también sirve de caso de estrés |
| 2.3 | Vídeo interactivo con archivo propio | El iDevice `interactive-video` real, apuntando a un `.mp4` del propio paquete: audita la vía de servido del plugin con media pesada |
| 2.4 | Vídeo interactivo con YouTube | El mismo iDevice contra un vídeo cross-origin, para separar «falla el iDevice» de «falla el servido local» |
| 3 | Imágenes y archivos | Introducción a los tres subapartados de imágenes y documentos |
| 3.1 | Imagen enlazada de otro sitio | Una imagen de verdad ajena al paquete (Wikimedia Commons), nunca copiada a él |
| 3.2 | Imagen integrada en el paquete | La vía de servido **propia del paquete**: imagen y fondo CSS son del propio `.elpx`, así que aquí sí puede afirmarse *carga real* |
| 3.3 | PDF y fichero fuente | Un PDF descargable y la fuente tipográfica propia del paquete |
| 4 | Iframe genérico | El embed que un modo seguro degradaría a *placeholder*, sin romper el resto de la página |
| 5 | Salida hacia la plataforma | Introducción a los cinco subapartados de acciones/medidas por anfitrión |
| 5.1 | Moodle | Demostraciones reversibles de la pestaña Demostración con Moodle seleccionado |
| 5.2 | WordPress | Ídem con WordPress |
| 5.3 | Omeka S | Ídem con Omeka S |
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
| `article` | Prosa libre: párrafos + tabla/lista/callout opcionales | Apartado 1, cada «sección» (2, 3, 5), los dos artículos del apartado 7 |
| `caseIntro` | «Qué se prueba aquí» + tabla de lo esperado en modo *secure*/*legacy* | Primer artículo de cada Caso (2.1-2.4, 3.1-3.3, 4) |
| `caseMedia` | La media del caso (icono `observe`, título específico) | Segundo artículo de cada Caso |
| `escapeIntro` | «Qué se prueba aquí» + aviso de que ninguna acción se ejecuta sola | Primer artículo de cada subapartado 5.1-5.5 |
| `actions` | Intro + marcador `data-exe-probe-demo-host` que la sonda rellena con los botones reales | Segundo artículo de 5.1-5.4; único artículo del apartado 6 |
| `intro` | Dos párrafos, un aviso ámbar intercalado y un tercer párrafo de cierre | Único bloque de este tipo: «Para qué sirve este paquete», primer artículo de Inicio |
| `toc` | La tabla Apartado / Qué encontrará, sin datos propios en `spec.json` | Único bloque de este tipo: «Cómo está organizado», segundo artículo de Inicio |
| `probe` | La sonda misma (`poc/probe/dist/probe.bundle.js`, leída byte a byte en cada `build.sh`) | Último bloque de cada página, salvo Inicio (no lleva sonda: la maqueta tampoco la dibuja bajo `isInicio`) |
| `interactiveVideo` | Un iDevice `interactive-video` real | Casos 2.3 y 2.4, como bloque adicional |

Ninguno de estos renderizadores dibuja un `<h2>` dentro de su HTML: el título del artículo
ya lo pinta eXeLearning solo, a partir del `icon`/`block_name` nativos del propio iDevice
(`block()` en `exelib.py`) — repetirlo dentro habría duplicado la cabecera.

El bloque `toc` de Inicio no lleva filas escritas a mano: `toc_idevice()` las deriva de
`spec["pages"]` (título + un campo `"summary"` nuevo en cada apartado de nivel superior),
así que la tabla no puede desincronizarse de la estructura real — si un apartado se añade,
se quita o se reordena en `spec.json`, la tabla lo sigue sola.

## La vista de la sonda: `línea` frente a `completo`

Esta es la reestructuración central de la tarea 24. La sonda (`poc/probe/src/entry/probe.js`)
admite dos vistas, elegidas por cada página con `window.__EXE_POC_VIEW`:

- **`completo`** — el panel de siempre, con sus tres pestañas (Resumen, Detalle,
  Demostración). Solo lo pide el Apartado 1.
- **`línea`** — un resumen compacto en el flujo de la página: el mismo veredicto (icono,
  título y `n de 10`) que calcularía la vista completa, sin pestañas ni tabla, con un
  puntero al Apartado 1 para el detalle. Lo piden los otros 18 apartados.

`exelib.py` emite `window.__EXE_POC_VIEW` como un `<script>` propio, antes del
`__EXE_POC_BUILD_ID` y del bundle, a partir del campo `"view"` de cada bloque `probe` en
`spec.json` (por defecto `"linea"` si se omite). Un valor ausente o desconocido de
`__EXE_POC_VIEW` se trata siempre como `completo`, así que nada que ya embeba el bundle
sin fijar la variable cambia de comportamiento. `verify.py` comprueba, página por página,
que el valor emitido es el esperado.

La vista línea nunca implica una medida que la vista completa no haya hecho también: pinta
exactamente el `verdict` que calcula `computeVerdict(result)`, el mismo objeto que pinta la
vista completa — no hay una medición «ligera» distinta para la vista compacta.

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
  ese estado. Se aplica a los Casos 2.1, 2.2 y 4.
- **`carga-real`** — el navegador expone una señal directa de carga (`naturalWidth`,
  `document.fonts.check`, `readyState`…), así que sí puede afirmarse que el asset se
  sirvió correctamente. Se aplica a los Casos 3.1, 3.2, 3.3 y al `<video>` local del
  Caso 2.3. El Caso 3.1 es la excepción deliberada: su imagen **no** es un asset del
  paquete (viene enlazada de Wikimedia Commons, sin `_bind_asset`), pero la señal
  `naturalWidth`/`complete` de un `<img>` es igual de fiable venga el archivo de dentro
  o de fuera del paquete — a diferencia de un iframe, que no expone su estado interno en
  cross-origin. Lo que cambia entre el Caso 3.1 y el 3.2 es de dónde viene el byte, no
  si la medida es honesta.

**Matiz importante para los Casos 2.3 y 2.4:** el panel solo mide el `<video>` que él
mismo inserta como control (el del bloque `case`), no el vídeo que crea en tiempo de
ejecución el propio iDevice `interactive-video`. En el Caso 2.3 el panel puede afirmar
*carga-real* de su `<video>` de control, pero que el iDevice se reproduzca y responda a
las diapositivas es una comprobación **visual**, no medida por el panel. En el Caso 2.4,
al ser todo cross-origin (YouTube), no hay ninguna medida de *carga-real* posible:
*frame-no-bloqueado* es la única afirmación honesta, y de nuevo el propio reproductor del
iDevice se verifica a ojo, no por el panel.

## Apartado 5: salida hacia la plataforma

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

Tres demostraciones (`poc/probe/src/hosts/showcase.js`), accesibles tanto desde la pestaña
Demostración de la sonda como directamente en el único artículo de esta página («Qué vería
la persona usuaria», bloque `actions` con `"host": "showcase"` — el mismo mecanismo que
5.1-5.4, aplicado a la vitrina en vez de a un anfitrión), de lo que podría hacer contenido
no aislado si consiguiera
pintar sobre el DOM del anfitrión: **voltear la página** (espejo horizontal), **tomar la
pantalla completa** con una animación tipo *terminal* y un aviso parpadeante, y **pintar
una ventana de identificación falsa** (servicio inventado, `CorreoNube 98`; campos de
solo lectura cuyo `.value` no se lee en ningún punto del código; aviso de «demostración,
no se ha capturado nada» al primer foco, tecleo o envío). Las tres comparten cuatro
reglas:

1. **Ninguna hace red.**
2. **Ninguna persiste** nada tras recargar la página.
3. **Todas se deshacen con un clic** (botón «Quitar» en su propia cinta).
4. **Todas se auto-retiran solas** al vencer el plazo (60 s).

Bajo origen opaco (modo *secure*) las tres devuelven `BLOQUEADO`: sin acceso al `document`
del padre, no hay DOM del anfitrión sobre el que pintar.

## Regenerar

```bash
cd poc/probe && npm install && npm run build   # solo si cambian las fuentes de la sonda;
                                                # dist/ ya está commiteado, así que normalmente se salta
cd poc/suite-src
bash build.sh          # escribe directamente ../exe-probe-suite.elpx
python3 verify.py      # valida ../exe-probe-suite.elpx (target por defecto); sale 1 y explica si falla
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
regenerar `exe-probe-suite.elpx` exigiría además Node/`npm` solo para producir un fichero
que casi nunca cambia entre una regeneración y la siguiente.
