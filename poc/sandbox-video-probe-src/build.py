#!/usr/bin/env python3
"""Rebuild sandbox-video-probe.elpx.

The video embeds + isolation probe are injected INSIDE content.xml (each page's
first text iDevice: htmlView + jsonProperties.textTextarea) so the eXeLearning
editor regenerates the pages WITH the content, and the same media block +
probe are mirrored into the exported HTML so a plain viewer (e.g. the
WordPress content proxy) shows them too.

Inputs (all next to this script):
  - benign-test.elpx : a clean eXeLearning package used as the base template.
  - probe.js         : the SAFE, didactic isolation probe (booleans + redacted
                       error names only; no network, no POST, no mutators).

Output:
  - sandbox-video-probe.elpx : the rebuilt package (also written next to this
                               script). Copy it up to ../sandbox-video-probe.elpx
                               to refresh the PoC artifact used by the paper.

Usage:
  python3 build.py
"""
import os
import shutil
import zipfile
import json
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
BENIGN = os.path.join(HERE, "benign-test.elpx")           # clean base package
PROBE = os.path.join(HERE, "probe.js")                    # didactic isolation probe
BUILD = os.path.join(HERE, "build")                       # intermediate extraction dir
OUT_ELPX = os.path.join(HERE, "sandbox-video-probe.elpx")  # rebuilt package

PROBE_JS = open(PROBE, encoding="utf-8").read()
assert "</script>" not in PROBE_JS, "probe must not contain a literal </script>"
PROBE_SCRIPT = "<script>\n" + PROBE_JS + "\n</script>"


def iframe(title, caption, src):
    return (f'<article class="box exe-media-probe"><header class="box-head no-icon">'
            f'<h1 class="box-title">{title}</h1></header><div class="box-content"><p>{caption}</p>'
            f'<div style="position:relative;max-width:640px;aspect-ratio:16/9;margin:8px 0">'
            f'<iframe src="{src}" title="{title}" width="640" height="360" '
            f'style="width:100%;height:100%;border:0" allow="autoplay; fullscreen; picture-in-picture" '
            f'allowfullscreen loading="lazy"></iframe></div></div></article>')


# pageName -> (export file, [(title, caption, src, is_pdf), ...])
PAGES = {
    "Page 1":        ("index.html",            [("Vídeo YouTube (youtube-nocookie)", "Embed cross-origin de YouTube; en modo opaco el shim lo aísla en el padre.", "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ", False)]),
    "Page 1 - 1":    ("html/page-1-1.html",    [("Vídeo Vimeo", "Embed cross-origin de Vimeo.", "https://player.vimeo.com/video/76979871", False)]),
    "Page 1 - 1 -1": ("html/page-1-1-1.html",  [("Vídeo Dailymotion", "Embed cross-origin de Dailymotion.", "https://www.dailymotion.com/embed/video/x2jvvep", False)]),
    "Page 1 - 2":    ("html/page-1-2.html",    [("iframe cross-origin genérico", "Iframe a otro origen; el shim lo degrada a placeholder.", "https://example.com/", False)]),
    "Page 2":        ("html/page-2.html",      [("PDF embebido", "PDF del propio paquete (rama PDF del sandbox).", "probe-embed.pdf", True)]),
    "Page 2 - 1":    ("html/page-2-1.html",    [("Dos vídeos (YouTube)", "Primer embed.", "https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ", False),
                                                ("Dos vídeos (Vimeo)", "Segundo embed en la misma página.", "https://player.vimeo.com/video/76979871", False)]),
}


def blocks_for(pagename, depth):
    embeds = PAGES[pagename][1]
    html = ""
    for (title, caption, src, is_pdf) in embeds:
        real = ("../" * depth + src) if is_pdf else src
        html += iframe(title, caption, real)
    return html


def main():
    if os.path.exists(BUILD):
        shutil.rmtree(BUILD)
    os.makedirs(BUILD)
    with zipfile.ZipFile(BENIGN) as z:
        z.extractall(BUILD)
    shutil.copy(PROBE, os.path.join(BUILD, "probe.js"))
    pdf = (b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
           b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
           b"4 0 obj<</Length 60>>stream\nBT /F1 18 Tf 30 80 Td (PROBE embedded PDF) Tj ET\nendstream endobj\n"
           b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n")
    open(os.path.join(BUILD, "probe-embed.pdf"), "wb").write(pdf)

    # (1) EXPORTED HTML: inject the media block + external probe reference per page.
    for pagename, (relpath, _embeds) in PAGES.items():
        full = os.path.join(BUILD, relpath)
        if not os.path.exists(full):
            print("WARN missing export", relpath)
            continue
        depth = relpath.count("/")
        html = open(full, encoding="utf-8").read()
        block = blocks_for(pagename, depth)
        probe_ref = f'\n<script src="{"../"*depth}probe.js"></script>\n'
        html = html.replace("</main>", block + "</main>", 1)
        html = html.replace("</body>", probe_ref + "</body>", 1)
        open(full, "w", encoding="utf-8").write(html)
        print("export patched", relpath)

    # (2) content.xml: inject media block + INLINE probe into each page's text iDevice.
    cxml = os.path.join(BUILD, "content.xml")
    tree = ET.parse(cxml)
    root = tree.getroot()
    patched = 0
    for nav in root.iter("odeNavStructure"):
        pname = nav.findtext("pageName")
        if pname not in PAGES:
            continue
        depth = 0 if PAGES[pname][0] == "index.html" else 1
        block = blocks_for(pname, depth) + PROBE_SCRIPT
        for comp in nav.iter("odeComponent"):
            if comp.findtext("odeIdeviceTypeName") != "text":
                continue
            hv = comp.find("htmlView")
            jp = comp.find("jsonProperties")
            if hv is not None and hv.text is not None:
                hv.text = hv.text + block
            if jp is not None and jp.text:
                data = json.loads(jp.text)
                data["textTextarea"] = (data.get("textTextarea", "") or "") + block
                jp.text = json.dumps(data, ensure_ascii=False)
            patched += 1
            break  # first text iDevice of the page
    tree.write(cxml, encoding="utf-8", xml_declaration=True)
    print("content.xml iDevices patched:", patched)

    if os.path.exists(OUT_ELPX):
        os.remove(OUT_ELPX)
    with zipfile.ZipFile(OUT_ELPX, "w", zipfile.ZIP_DEFLATED) as z:
        for r, _d, files in os.walk(BUILD):
            for f in files:
                ap = os.path.join(r, f)
                z.write(ap, os.path.relpath(ap, BUILD))
    print("WROTE", OUT_ELPX, os.path.getsize(OUT_ELPX), "bytes")


if __name__ == "__main__":
    main()
