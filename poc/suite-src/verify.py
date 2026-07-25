#!/usr/bin/env python3
"""Comprueba las invariantes de exe-probe-suite.elpx.

Se ejecuta después de build.sh. Sale con 0 si el paquete cumple, con 1 y un
informe si no. Es el test de la tarea 18 (extendido en la tarea 24 para la
nueva arquitectura de 19 páginas): no hay pytest en este repositorio, así que
la verificación es un script con asertos explícitos. Si falla, el generador
(exelib.py / spec.json) es lo que hay que arreglar, no este script.

El content.xml que emite la CLI lleva namespace
(xmlns="http://www.intef.es/xsd/ode"); el de las páginas exportadas no lo
necesita porque son HTML, no XML.

Uso:
  python3 verify.py [../exe-probe-suite.elpx]
"""
import hashlib
import os
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ELPX = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "exe-probe-suite.elpx")
BUNDLE = os.path.join(HERE, "..", "probe", "dist", "probe.bundle.js")

# marcador de página (título exacto de su bloque "case", tal y como aparece en
# su <h2>) -> texto que también debe aparecer en esa misma página, para no
# confundir el marcador con la simple mención del título en el menú de
# navegación persistente, que eXeLearning repite en todas las páginas. Las 19
# claves son las 19 páginas de la arquitectura de la tarea 24: 7 apartados de
# nivel superior (1, 2, 3, 4, 5, 6, 7) y sus 12 subapartados (2.1-2.4,
# 3.1-3.3, 5.1-5.5).
CASES = {
    "1. Resultado de la medición": "Todas las páginas de este paquete comparten una misma sonda",
    "2. Vídeos": "El vídeo es el recurso externo más habitual",
    "2.1. Vídeo de YouTube": "youtube-nocookie.com",
    "2.2. Vimeo y Dailymotion": "frame-ancestors",
    "2.3. Vídeo interactivo con archivo propio": "audita de verdad la vía de servido del plugin",
    "2.4. Vídeo interactivo con YouTube": "frame-no-bloqueado es la única afirmación honesta",
    "3. Imágenes y archivos": "cambia lo que puede afirmarse de su carga",
    "3.1. Imagen enlazada de otro sitio": "sin copiarla al paquete",
    "3.2. Imagen integrada en el paquete": "vía de servido opaca del plugin",
    "3.3. PDF y fichero fuente": "fuente tipográfica declarada por la hoja de estilos",
    "4. Iframe genérico": "iDevice de texto y código incrustado",
    "5. Salida hacia la plataforma": "cuarto anfitrión con demostraciones reales",
    "5.1. Moodle": "destino más frecuente de un paquete SCORM",
    "5.2. WordPress": "publicar materiales exportados como sitio web",
    "5.3. Omeka S": "repositorios y exposiciones digitales",
    "5.4. Nextcloud": "no estaba en la maqueta de diseño",
    "5.5. Servidor genérico": "sin capturar una sola pulsación de teclado ni enviar un solo byte",
    "6. Ejemplos de impacto": "voltear la página",
    "7. Cómo interpretar los resultados": "ha podido este contenido salir de su propio marco",
}

PAGE_COUNT = len(CASES)  # 19

# Vista que cada página pide a la sonda (window.__EXE_POC_VIEW). Solo el
# apartado 1 pide el panel completo; el resto pide el resumen de una línea
# que remite a él (ver poc/probe/src/entry/probe.js:resolveView y
# exelib.py:probe_idevice).
def expected_view(marker):
    return "completo" if marker == "1. Resultado de la medición" else "linea"


ASSET_BASENAMES = [
    "probe-embed.pdf",
    "probe-asset.svg",
    "probe-asset.css",
    "probe-asset.woff",
    "probe-local.mp4",
]

problems = []


def check(condition, message):
    if not condition:
        problems.append(message)


if not os.path.exists(ELPX):
    print(f"VERIFICACIÓN FALLIDA:\n - no existe {ELPX} (ejecuta build.sh primero)")
    sys.exit(1)

with open(BUNDLE, encoding="utf-8") as f:
    SOURCE_BUNDLE = f.read()

with zipfile.ZipFile(ELPX) as archive:
    names = archive.namelist()

    # --- assets propios del paquete, en algún content/resources/<id>/ -------
    # La imagen externa del Caso 3.1 (Example.jpg, Wikimedia Commons) NO está
    # aquí a propósito: es un enlace de verdad a otro servidor, nunca copiada
    # al paquete (ver exelib.py: media kind "externalImage").
    resource_names = {os.path.basename(n) for n in names if n.startswith("content/resources/")}
    for base in ASSET_BASENAMES:
        check(base in resource_names, f"falta el asset propio del paquete: {base}")

    # --- content.xml: namespace, 19 páginas, 2 interactive-video, tema base -
    content_xml = archive.read("content.xml").decode("utf-8")
    root = ET.fromstring(content_xml)
    ns = root.tag.split("}")[0] + "}" if "}" in root.tag else ""

    def T(tag):
        return ns + tag

    pages = [n.findtext(T("pageName")) for n in root.iter(T("odeNavStructure"))]
    check(len(pages) == PAGE_COUNT, f"se esperaban {PAGE_COUNT} páginas, hay {len(pages)}: {pages}")

    # --- ninguna página repite el nombre de bloque en dos de sus bloques ----
    # Esto es justo lo que habría atrapado la regresión de la tarea 23: el
    # bloque "case" y el bloque "probe" (y, en los Casos 2.3/2.4, también
    # "interactiveVideo") caían los tres en el título de la página por no
    # llevar blockName propio, así que esa cabecera se veía duplicada (o
    # triplicada) en pantalla. Sigue funcionando igual con la arquitectura de
    # 19 páginas: no depende del número ni del anidamiento de páginas.
    page_names = {
        nav.findtext(T("odePageId")): nav.findtext(T("pageName"))
        for nav in root.iter(T("odeNavStructure"))
    }
    blocks_by_page = {}
    for struct in root.iter(T("odePagStructure")):
        pid = struct.findtext(T("odePageId"))
        blocks_by_page.setdefault(pid, []).append(struct.findtext(T("blockName")))
    # OJO: nombrar esto "names" reescribiría, en este script sin funciones,
    # el "names" de archive.namelist() usado más abajo para listar el .elpx.
    for pid, block_names in blocks_by_page.items():
        dupes = sorted({n for n in block_names if block_names.count(n) > 1})
        check(
            not dupes,
            f"la página «{page_names.get(pid, pid)}» tiene bloques con el nombre repetido: {dupes}",
        )

    iv_components = [
        c for c in root.iter(T("odeComponent"))
        if c.findtext(T("odeIdeviceTypeName")) == "interactive-video"
    ]
    check(
        len(iv_components) == 2,
        f"se esperaban 2 componentes interactive-video, hay {len(iv_components)}",
    )

    theme = None
    for pref in root.iter(T("userPreference")):
        if pref.findtext(T("key")) == "theme":
            theme = pref.findtext(T("value"))
    check(theme == "base", f"el tema declarado en userPreferences es {theme!r}, se esperaba 'base'")

    # La sonda va inline en un iDevice text por página: 19 páginas -> 19
    # bloques de texto que contienen __EXE_POC_RESULT (uno de los dos/tres
    # `text` por página; los otros son la cinta+cabecera+media y, en 2.3/2.4,
    # el interactive-video, que no es un `text`).
    probe_blocks_in_xml = 0
    for comp in root.iter(T("odeComponent")):
        if comp.findtext(T("odeIdeviceTypeName")) != "text":
            continue
        html_view = comp.findtext(T("htmlView")) or ""
        if "__EXE_POC_RESULT" in html_view:
            probe_blocks_in_xml += 1
    check(
        probe_blocks_in_xml == PAGE_COUNT,
        f"la sonda está inline en {probe_blocks_in_xml} bloques text de content.xml, se esperaban {PAGE_COUNT}",
    )

    # --- el bundle en sí: publica __EXE_POC_RESULT, sin </script> literal ---
    check("__EXE_POC_RESULT" in SOURCE_BUNDLE, "el bundle no publica __EXE_POC_RESULT")
    check("</script>" not in SOURCE_BUNDLE, "el bundle contiene un </script> literal")

    # --- cada página exportada: marcador de caso + cinta de identidad + ------
    #     VIEW correcto + bundle inline BYTE A BYTE (no solo "está", sino que
    #     es exactamente el mismo texto que poc/probe/dist/probe.bundle.js) --
    html_files = {n: archive.read(n).decode("utf-8") for n in names if n == "index.html" or n.startswith("html/")}
    check(
        len(html_files) >= PAGE_COUNT,
        f"se esperaban al menos {PAGE_COUNT} páginas HTML exportadas, hay {len(html_files)}",
    )

    # Grupo 1: window.__EXE_POC_VIEW. Grupo 2: el bundle, capturado entre el
    # <script> del build id y su cierre.
    script_re = re.compile(
        r'window\.__EXE_POC_VIEW="(linea|completo)";</script>\s*'
        r'<script>window\.__EXE_POC_BUILD_ID="[0-9a-f]+";</script>\s*'
        r'<script>(.*?)</script>',
        re.S,
    )

    # eXeLearning repite el título de CADA página como enlace <a> en el menú de
    # navegación persistente de TODAS las páginas exportadas, así que buscar el
    # marcador como simple substring encontraría el caso en las 19 páginas a la
    # vez. El propio bloque de caso, en cambio, envuelve el título en un <h2>
    # (ver case_header() en exelib.py) — eso sí identifica la página dueña.
    h2_re = re.compile(r"<h2[^>]*>([^<]*)</h2>")

    for marker, companion in CASES.items():
        owners = [
            path for path, html in html_files.items()
            if any(marker in h2 for h2 in h2_re.findall(html))
        ]
        check(
            len(owners) == 1,
            f"se esperaba exactamente 1 página con el caso «{marker}» en su <h2>, hay {len(owners)}: {owners}",
        )
        for path in owners:
            html = html_files[path]
            check(companion in html, f"{path}: falta «{companion}» junto al caso «{marker}»")
            check(
                "RECURSO DE PRUEBA DE SEGURIDAD" in html,
                f"{path}: falta la cinta de identidad junto al caso «{marker}»",
            )
            check(
                "Esperado en modo seguro" in html,
                f"{path}: la cabecera de caso no declara el resultado esperado",
            )
            m = script_re.search(html)
            check(m is not None, f"{path}: no se encontró VIEW+BUILD_ID+bundle inline tras __EXE_POC_VIEW")
            if m:
                want_view = expected_view(marker)
                check(
                    m.group(1) == want_view,
                    f"{path}: __EXE_POC_VIEW es {m.group(1)!r}, se esperaba {want_view!r} para «{marker}»",
                )
                check(
                    m.group(2) == SOURCE_BUNDLE,
                    f"{path}: el bundle inline no coincide byte a byte con probe/dist/probe.bundle.js",
                )

    # --- los dos vídeos interactivos exportados: uno local, uno YouTube -----
    local_video_pages = [p for p, html in html_files.items() if 'href="../content/resources/' in html and ".mp4" in html]
    youtube_iv_pages = [
        p for p, html in html_files.items()
        if 'exe-interactive-video-file' in html and 'href="https://www.youtube.com/watch' in html
    ]
    check(len(local_video_pages) >= 1, "ninguna página exportada referencia el vídeo local por ruta relativa")
    check(len(youtube_iv_pages) >= 1, "ninguna página exportada tiene el iDevice interactive-video contra YouTube")

if problems:
    print("VERIFICACIÓN FALLIDA:")
    for p in problems:
        print(" -", p)
    sys.exit(1)

print("VERIFICACIÓN OK:", ELPX)
