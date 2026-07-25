# `suite-src/` — generador de `exe-probe-suite.elpx`

Genera el artefacto principal de la batería (`../exe-probe-suite.elpx`) a partir de un
*spec* declarativo (`spec.json`), invocando **la CLI real de eXeLearning** para producir
un `.elpx` indistinguible de uno hecho a mano en el editor — no un ZIP hecho a pulso.

## Ficheros

| Fichero | Qué hace |
|---|---|
| `spec.json` | *Spec* declarativo de las 8 páginas del paquete: título, qué prueba cada caso y qué se espera en modo *secure* vs *legacy* | 
| `exelib.py` | Construye, desde `spec.json`, un `content.xml` mínimo empaquetado como `.elp` intermedio (no es un ODE 2.0 completo: le faltan DOCTYPE, `xmlns`/versión y algunos recursos que el exportador ya no produce, pero el importador de la CLI lo tolera) |
| `build.sh` | Orquesta: `exelib.py` → `.elp` intermedio → `make export-elpx` de la CLI real → `../exe-probe-suite.elpx` |
| `verify.py` | Comprueba las invariantes del `.elpx` ya construido (páginas, iDevices, assets, bundle byte a byte) y sale con 1 y un informe si algo falla — es el test de esta tarea: no hay pytest en el repositorio |
| `assets/` | Los cinco assets propios del paquete usados en el Caso 4/6 y el Caso 5/6: `probe-asset.css`, `probe-asset.svg`, `probe-asset.woff`, `probe-embed.pdf`, `probe-local.mp4` |

## Mapa de casos (`spec.json`)

Ocho páginas: una consola, seis casos numerados (`CASO n/6`) y una vitrina de impacto.

| # | Página | Qué prueba |
|---|---|---|
| — | Consola de pruebas | El instrumento sin media: veredicto, las demos de los cuatro anfitriones y la vitrina de impacto, sin nada que compita por la pantalla |
| 1/6 | Vídeo YouTube (`nocookie`) | Embed cross-origin canónico: que el aislamiento no rompa un vídeo legítimo |
| 2/6 | Vimeo y Dailymotion | Dos proveedores con distinta política de `frame-ancestors` en la misma página; también sirve de caso de estrés |
| 3/6 | iframe cross-origin genérico | El embed que un modo seguro degradaría a *placeholder*, sin romper el resto de la página |
| 4/6 | PDF, imagen, fondo y fuente del paquete | La vía de servido **propia del paquete**: los cuatro assets son del propio `.elpx`, así que aquí sí puede afirmarse *carga real* |
| 5/6 | Vídeo interactivo con vídeo local | El iDevice `interactive-video` real, apuntando a un `.mp4` del propio paquete |
| 6/6 | Vídeo interactivo con YouTube | El mismo iDevice contra un vídeo cross-origin, para separar «falla el iDevice» de «falla el servido local» |
| — | Vitrina de impacto | Tres demostraciones visuales de lo que podría hacer contenido no aislado (ver más abajo) |

Cada página lleva, además del título, dos bloques `text` inyectados por `exelib.py`: el
bloque **`case`** (cinta de identidad + cabecera del caso + su media) y el bloque
**`probe`** (la sonda, `poc/probe/dist/probe.bundle.js`, leída byte a byte en cada
`build.sh`). Las páginas 5/6 y 6/6 añaden además un tercer bloque: un iDevice
`interactive-video` real.

## La cinta de identidad y la cabecera de caso

Todas las páginas llevan la misma cinta (`identity_strip()` en `exelib.py`):
**«RECURSO DE PRUEBA DE SEGURIDAD — no es material didáctico real»**, seguida del build
id, la fecha y su hash. Cada caso lleva además su propia cabecera (`case_header()`): qué
prueba, qué se espera en modo *secure* y qué se espera en modo *legacy* — en texto plano,
para que quien abra el paquete sepa qué está viendo sin tener que leer el código.
`verify.py` comprueba que ambas cadenas están presentes en el `<h2>` de cada caso.

## `frame-no-bloqueado` frente a `carga-real`

El panel (`poc/probe/src/core/media.js`) distingue dos afirmaciones sobre la media
medida, y no las mezcla:

- **`frame-no-bloqueado`** — lo máximo que puede afirmarse de un `<iframe>`/`<object>`
  cross-origin: el navegador no bloqueó el frame y este ocupa su caja. No puede
  afirmarse que el vídeo *reproduzca*, porque en cross-origin el navegador no expone
  ese estado. Se aplica a los Casos 1/6, 2/6 y 3/6.
- **`carga-real`** — reservado a los assets **propios del paquete** (imagen, fuente,
  fondo CSS, `<video>`): aquí sí puede afirmarse que el asset se sirvió correctamente.
  Se aplica al Caso 4/6 (PDF, imagen, fondo y fuente) y al `<video>` local del Caso 5/6.

**Matiz importante para los Casos 5/6 y 6/6:** el panel solo mide el `<video>` que él
mismo inserta como control (el del bloque `case`), no el vídeo que crea en tiempo de
ejecución el propio iDevice `interactive-video`. En el Caso 5/6 el panel puede afirmar
*carga-real* de su `<video>` de control, pero que el iDevice se reproduzca y responda a
las diapositivas es una comprobación **visual**, no medida por el panel. En el Caso 6/6,
al ser todo cross-origin (YouTube), no hay ninguna medida de *carga-real* posible:
*frame-no-bloqueado* es la única afirmación honesta, y de nuevo el propio reproductor del
iDevice se verifica a ojo, no por el panel.

## Vitrina de impacto y sus cuatro reglas

Tres demostraciones (`poc/probe/src/hosts/showcase.js`) de lo que podría hacer contenido
no aislado si consiguiera pintar sobre el DOM del anfitrión: **voltear la página**
(espejo horizontal), **tomar la pantalla completa** con una animación tipo *terminal* y
un aviso parpadeante, y **pintar una ventana de identificación falsa** (servicio
inventado, `CorreoNube 98`; campos de solo lectura cuyo `.value` no se lee en ningún
punto del código; aviso de «demostración, no se ha capturado nada» al primer foco,
tecleo o envío). Las tres comparten cuatro reglas:

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
