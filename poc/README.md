# PoC seguras — sonda de aislamiento de contenido educativo

PoC **didácticas** que **detectan** qué capacidades tiene el contenido embebido en un LMS/CMS.
La **sonda de 15 comprobaciones** (fuente única en `probe/`, compilada a
`probe/dist/probe.bundle.js`) es de **solo lectura**: produce booleanos + nombres de error
censurados, **no** exfiltra, **no** hace red, **no** hace `POST`, **no** lee valores reales de
cookie/sesskey y **no** llama mutadores SCORM (`LMSSetValue`). Además, la sonda incluye
**demos de acción opcionales** para **cuatro anfitriones** (Moodle, WordPress, Omeka S,
Nextcloud) que, **solo al pulsarlas** y **solo en modo same-origin/legacy**, ejecutan acciones
**autorizadas** contra el laboratorio —incluidos `POST`/`PUT` reales—; en modo *secure* (origen
opaco) devuelven `BLOQUEADO`/`SecurityError`. Cada demo queda anotada en un **diario de
reversión**: lo que puede deshacerse por programa se deshace con el botón **Revertir todo**
del panel; lo que no, se barre a mano (ver [«Barrido de lo creado por las demos»](#barrido-de-lo-creado-por-las-demos)
más abajo). Solo para laboratorio local y desechable.

## Ficheros

| Fichero | Qué es | Dónde se usa |
|---|---|---|
| `probe/` | **Fuente única de la sonda**: núcleo de medidas, adaptadores de anfitrión (Moodle, WordPress, Omeka S, Nextcloud), vitrina de impacto y panel. Se compila con `npm run build`; `probe/dist/probe.bundle.js` está commiteado | consumida por `poc/build.sh` y por `suite-src/spec.json` |
| `pwned-avatar.svg` | Avatar propio (CC0) con el que las demos sustituyen la foto de perfil. La sonda lo lleva **embebido** (`probe/src/hosts/avatar-svg.js`, generado desde este fichero) y lo rasteriza a PNG en un `canvas` local: ninguna demo descarga imágenes de terceros | demos `ownUser` (Moodle) y `photo` (WordPress) |
| `evil-page.html` | **Único HTML canónico de Página**, generado con la sonda actual *inline*, la misma tabla nativa de diez comprobaciones de la página 1, botones Moodle y tres efectos visuales opt-in (Matrix, giro y login simulado) | recurso *Página* / `file://` |
| `evil_scorm.zip` | Exportación SCORM 1.2 real de las 21 páginas de `evil.elpx`, generada por la CLI de eXeLearning desde la misma fuente; incluye `content.xml`, manifiesto, navegación, assets y sonda | `mod_scorm`, `mod_exescorm` |
| `evil.elpx` | **Único paquete eXeLearning** (21 páginas): casos numerados, media medida y la sonda en `content.xml` **y** en el HTML exportado. Es el que se sube y del que salen los dos siguientes | `mod_exelearning`, WP, Omeka; demo Playground |
| `evil_web.zip` | Exportación HTML5 real de las mismas 21 páginas, generada por la CLI de eXeLearning desde la misma fuente | `mod_exeweb` |
| `playground-blueprint.json` | Blueprint de WordPress Playground que instala el plugin en **modo legacy same-origin**, siembra `evil.elpx` y abre la página del *shortcode* — reproducción del escape en un clic | WordPress Playground |
| `evil.h5p` | Paquete H5P base + intento de `<script>`/`<img onerror>` en `content.json` | `mod_h5pactivity` — **control negativo** (los parámetros se filtran) |
| `evil-h5p-library.h5p` | Librería H5P propia (`H5P.ExePocAlert`) cuyo `preloadedJs` se ejecuta | `mod_h5pactivity` — **PoC positiva**: las librerías son código de confianza (requiere `moodle/h5p:updatelibraries`, gestión/administración) |
| `build.sh` | Regenera los artefactos de forma reproducible | — |
| `src-h5p-lib/` | Fuentes de `evil-h5p-library.h5p` (`h5p.json`, `content/`, librería `H5P.ExePocAlert-1.0/`) | — |
| `suite-src/` | Generador de `evil.elpx` (`spec.json`, `exelib.py`, `build.sh`, `verify.py`, `assets/`) con su propio README | — |

> `evil` es solo una convención didáctica para el artículo; el contenido es inocuo.

**Los dos planos de H5P.** `evil.h5p` prueba el plano de **parámetros** (`content.json`): Moodle los filtra (`H5PContentValidator`/`filter_xss`, sin `<script>` ni `on*`), así que es un **control negativo**. `evil-h5p-library.h5p` prueba el plano de **librerías**: el `preloadedJs` de una librería H5P es **código de confianza** que se ejecuta *same-origin* y sin sandbox; la barrera es la capacidad `moodle/h5p:updatelibraries` (gestión/administración, `RISK_XSS`), no el saneamiento — igual patrón que `mod_page`. Evidencia y citas `archivo:línea`: `../evidencias/resultados-h5p-library.json`.

## Las 15 comprobaciones de la sonda (`probe/`)

1. ejecuta JavaScript · 2. accede a `window.parent` · 3. lee `parent.document` ·
4. lee `parent.document.cookie` (solo *si* es legible; valor `REDACTED`) ·
5. localiza un `sesskey` (sin mostrarlo) · 6. localiza formularios/enlaces de edición ·
7. accede al *top* (sin navegar) · 8. abre popups (abre y cierra al instante) ·
9. `postMessage` disponible · 10. alcanza `window.API`/`API_1484_11` (sin invocar) ·
11. `localStorage`/`sessionStorage` · 12. captura `SecurityError`/`DOMException` (solo nombre) ·
13. origen opaco · 14. lee su propio `sandbox` / same-origin efectivo · 15. *sandbox escape*
(detectado, **nunca** ejecutado).

Salida: tabla visible dentro del contenido + `window.__EXE_POC_RESULT` (JSON) +
`console.log('[EXE-POC] …')`.

## Reproducir

```bash
cd poc/suite-src
bash build.sh                  # exporta evil.elpx, evil_web.zip y evil_scorm.zip con eXeLearning
python3 verify.py              # comprueba los tres formatos, incluida la página 5.1
cd ..
bash build.sh                  # regenera evil-page.html y H5P; usa la suite ya exportada
```

`build.sh` toma la sonda ya compilada en `probe/dist/probe.bundle.js` (commiteada) y falla con
un mensaje claro si falta. Solo hace falta recompilarla —`cd probe && npm install && npm run
build`— cuando se toquen las fuentes en `probe/src/`; `npm test` (en `probe/`) corre la batería
de Vitest, incluido el test de no-fuga transversal.

`evil-page.html` no es una exportación de eXeLearning porque eso alteraría la prueba:
Moodle Página guarda y ejecuta HTML en el documento superior, mientras que un paquete eXe
pertenece a los flujos de `mod_exelearning`, `mod_exeweb` o `mod_exescorm`. Para importarlo,
abre el editor HTML de una Página marcada `POC-SAFE` y pega el contenido del `<body>`; el
JavaScript va autocontenido porque `mod_page` no sirve ficheros hermanos: el bundle se
codifica en Base64 y un loader mínimo lo inserta mediante `textContent`, evitando que el
editor convierta operadores `>` en `&gt;`. Las acciones reales
aparecen como botones y nunca se disparan durante la carga. La vitrina añade Matrix, giro de
pantalla y login simulado: solo alteran temporalmente el DOM local, no hacen red y el formulario
no captura datos. «Resultado de la sonda» reutiliza
el HTML, CSS y renderer de la página 1 de `evil.elpx`: muestra el veredicto y las diez filas,
no solo el resumen de una línea.

Los tres artefactos eXeLearning (`evil.elpx`, `evil_web.zip`, `evil_scorm.zip`) parten del
mismo `.elp` intermedio y los emite la CLI real: no hay manifiestos o XML injertados a mano.
La página 5.1 conserva en los tres el cambio inmediato del avatar del DOM padre, su borde
verde y el cambio persistente de nombre/foto tras pulsar. Tanto esos tres formatos como
`evil-page.html` transportan el bundle en un cargador Base64 cuyo texto JavaScript no
contiene `<`, `>` ni `&`: así las rutas de edición eXe/Moodle no pueden romper funciones
flecha u operadores al serializarlos como entidades HTML. `evil-h5p-library.h5p` se
construye desde `src-h5p-lib/`, también sin fixtures. El único que sí necesita una base
externa es `evil.h5p`:
- `BASE_H5P` (def. `$FIX/h5p/question-set-demo.h5p`, con `FIX=../fixtures`)
Apunta `FIX` (o `BASE_H5P`) a tu checkout local de `mod_exelearning` (`research/fixtures/`).
Si falta, `build.sh` construye todo lo demás y termina con error explícito.

Override: `BASE_H5P=/ruta/y.h5p bash build.sh`.

Regenerar los tres formatos eXeLearning es un paso aparte (`cd suite-src && bash build.sh`)
porque necesita la CLI real de eXeLearning; por eso se publican ya construidos.

## Cómo se probaron (laboratorio)

Subir/abrir cada PoC en un curso desechable marcado `POC-SAFE` y observar la tabla de
salida. En contenido **same-origin** la sonda puede inyectarse desde el padre (simula lo que
haría el contenido); en contenido **opaco** solo se observa la tabla renderizada dentro del
iframe. Resultados en `../evidencias/resultados-vivos.json` y `../evidencias/tarjetas/`.

## Barrido de lo creado por las demos

Todo lo que crean las demos lleva el prefijo `POC-<build>-<marca>`. El botón
**Revertir todo** del panel deshace lo que es reversible por programa y muestra el
saldo; lo que no, se barre a mano:

| Plataforma | Qué puede quedar | Cómo barrerlo |
|---|---|---|
| Moodle | Curso `POC-…`, etiqueta y 50 mensajes; si no puede crear cursos, foro `POC-SAFE` y 50 contribuciones en el curso actual; nombre y foto | Borrar el curso `POC-…` o el foro `POC-SAFE`; nombre y foto desde el perfil |
| WordPress | Entradas y páginas `POC-…`, adjunto en Medios, `display_name` | Papelera de Entradas y Páginas; borrar el adjunto en Medios; nombre desde tu perfil |
| Omeka S | Ítem `POC-…` | Admin → Ítems → buscar `POC-` → borrar |
| Nextcloud | Fichero `POC-….txt` en la carpeta personal, `displayname` | Files → borrar el fichero y vaciar la papelera; nombre desde Ajustes personales |

## Qué NO contienen

Sin payloads de robo de cookies/tokens, sin código de exfiltración, sin instrucciones de
explotación reutilizables contra terceros. Las demos de acción hacen peticiones
**same-origin** contra tu propio laboratorio (`POST`/`PUT` autorizados, ver la tabla de
barrido arriba) y **ninguna cross-origin**: la imagen con la que sustituyen la foto de
perfil es `pwned-avatar.svg`, gráfico propio (CC0) que viaja **embebido** en la sonda y se
rasteriza a PNG en un `canvas` local. Ningún dato sale del laboratorio hacia terceros y
ningún tercero recibe una petición.
