#!/usr/bin/env python3
"""Comprueba las invariantes de exe-probe-suite.elpx.

Se ejecuta después de build.sh. Sale con 0 si el paquete cumple, con 1 y un
informe si no. Es el test de la tarea 18: no hay pytest en este repositorio,
así que la verificación es un script con asertos explícitos. Si falla, el
generador (exelib.py / spec.json) es lo que hay que arreglar, no este script.

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

# marker de caso -> texto que también debe aparecer (para no confundir el
# marcador con una simple mención en el menú de navegación, que eXeLearning
# repite en todas las páginas).
CASES = {
    "Consola": "Veredicto AISLADO",
    "CASO 1/6": "Vídeo YouTube",
    "CASO 2/6": "Vimeo",
    "CASO 3/6": "iframe cross-origin",
    "CASO 4/6": "PDF, imagen, fondo y fuente",
    "CASO 5/6": "Vídeo interactivo con vídeo local",
    "CASO 6/6": "Vídeo interactivo con YouTube",
    "Vitrina de impacto": "voltear la página",
}

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
    resource_names = {os.path.basename(n) for n in names if n.startswith("content/resources/")}
    for base in ASSET_BASENAMES:
        check(base in resource_names, f"falta el asset propio del paquete: {base}")

    # --- content.xml: namespace, 8 páginas, 2 interactive-video, tema base --
    content_xml = archive.read("content.xml").decode("utf-8")
    root = ET.fromstring(content_xml)
    ns = root.tag.split("}")[0] + "}" if "}" in root.tag else ""

    def T(tag):
        return ns + tag

    pages = [n.findtext(T("pageName")) for n in root.iter(T("odeNavStructure"))]
    check(len(pages) == 8, f"se esperaban 8 páginas, hay {len(pages)}: {pages}")
    check(
        any(p and "Consola" in p for p in pages),
        f"ninguna página se llama Consola: {pages}",
    )
    check(
        any(p and "Vitrina" in p for p in pages),
        f"ninguna página se llama Vitrina: {pages}",
    )

    # --- ninguna página repite el nombre de bloque en dos de sus bloques ----
    # Esto es justo lo que habría atrapado la regresión de la tarea 23: el
    # bloque "case" y el bloque "probe" (y, en los casos 5/6, también
    # "interactiveVideo") caían los tres en el título de la página por no
    # llevar blockName propio, así que esa cabecera se veía duplicada (o
    # triplicada) en pantalla.
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

    # La sonda va inline en un iDevice text por página: 8 páginas -> 8 bloques
    # de texto que contienen __EXE_POC_RESULT (uno de los dos `text` por
    # página; el otro es la cinta+cabecera+media).
    probe_blocks_in_xml = 0
    for comp in root.iter(T("odeComponent")):
        if comp.findtext(T("odeIdeviceTypeName")) != "text":
            continue
        html_view = comp.findtext(T("htmlView")) or ""
        if "__EXE_POC_RESULT" in html_view:
            probe_blocks_in_xml += 1
    check(
        probe_blocks_in_xml == 8,
        f"la sonda está inline en {probe_blocks_in_xml} bloques text de content.xml, se esperaban 8",
    )

    # --- el bundle en sí: publica __EXE_POC_RESULT, sin </script> literal ---
    check("__EXE_POC_RESULT" in SOURCE_BUNDLE, "el bundle no publica __EXE_POC_RESULT")
    check("</script>" not in SOURCE_BUNDLE, "el bundle contiene un </script> literal")

    # --- cada página exportada: marcador de caso + cinta de identidad + ------
    #     bundle inline BYTE A BYTE (no solo "está", sino que es exactamente
    #     el mismo texto que poc/probe/dist/probe.bundle.js) --------------
    html_files = {n: archive.read(n).decode("utf-8") for n in names if n == "index.html" or n.startswith("html/")}
    check(len(html_files) >= 8, f"se esperaban al menos 8 páginas HTML exportadas, hay {len(html_files)}")

    script_re = re.compile(
        r'window\.__EXE_POC_BUILD_ID="[0-9a-f]+";</script>\s*<script>(.*?)</script>', re.S
    )

    # eXeLearning repite el título de CADA página como enlace <a> en el menú de
    # navegación persistente de TODAS las páginas exportadas, así que buscar el
    # marcador como simple substring encontraría el caso en las 8 páginas a la
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
            check(companion in html_files[path], f"{path}: falta «{companion}» junto al caso «{marker}»")
        for path in owners:
            html = html_files[path]
            check(
                "RECURSO DE PRUEBA DE SEGURIDAD" in html,
                f"{path}: falta la cinta de identidad junto al caso «{marker}»",
            )
            check(
                "Esperado en modo seguro" in html,
                f"{path}: la cabecera de caso no declara el resultado esperado",
            )
            m = script_re.search(html)
            check(m is not None, f"{path}: no se encontró el bundle inline tras __EXE_POC_BUILD_ID")
            if m:
                check(
                    m.group(1) == SOURCE_BUNDLE,
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
