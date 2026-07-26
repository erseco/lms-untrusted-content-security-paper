#!/usr/bin/env python3
"""Genera assets/probe-embed.pdf: una guía de uso real, breve, en PDF puro
(sin dependencias — solo la biblioteca estándar), para que build.sh la
produzca de forma reproducible en cada regeneración en vez de servir un
archivo binario committeado con contenido de relleno.

Task 25 fix round: el PDF anterior era un stub de 395 bytes sin contenido
real, y el Caso 3.3 lo usaba como "documento descargable" — un enlace
muerto en la práctica. Este script escribe un PDF de una página con texto
de verdad: cómo abrir el paquete y cómo leer su resultado.

Uso:
  python3 build_pdf.py <ruta-de-salida.pdf>
"""
import sys
import textwrap

TITLE = "Guia de uso - Sonda de aislamiento eXeLearning"

# Sin acentos: WinAnsiEncoding con Helvetica los soporta, pero mantener el
# guion bajo ASCII simplifica el escapado de cadenas PDF y evita cualquier
# duda sobre la tabla de codificación del lector.
PARAGRAPHS = [
    "Este documento es la guia de uso del paquete de prueba de aislamiento "
    "de eXeLearning. No es material didactico: es un banco de pruebas de "
    "seguridad para laboratorio propio.",
    "Como abrirlo: publique el archivo .elpx en la plataforma que quiera "
    "comprobar (Moodle, WordPress, Omeka S, Nextcloud o un servidor propio) "
    "y abralo como abriria cualquier paquete SCORM o contenido web de "
    "eXeLearning.",
    "Como leer el resultado: el apartado 1, 'Resultado de la medicion', "
    "recoge el veredicto conjunto y el detalle de las diez comprobaciones. "
    "El resto de apartados muestran solo un resumen de una linea que "
    "remite a ese apartado 1.",
    "Los apartados 5.1 a 5.4 y el apartado 6 llevan botones de accion "
    "reales, reversibles, contra la plataforma detectada; solo se ejecutan "
    "si se pulsan. Ninguna accion captura pulsaciones de teclado ni envia "
    "el contenido de la pagina a otro servidor.",
    "Advertencia: abra este paquete solo en un entorno de pruebas propio. "
    "Aunque ninguna accion es destructiva y todas son reversibles, se "
    "ejecutan de verdad contra la plataforma en la que este publicado.",
]


def _escape(s):
    return s.replace("\\", r"\\").replace("(", r"\(").replace(")", r"\)")


def _wrap(text, width=92):
    return textwrap.wrap(text, width=width) or [""]


def _build_lines():
    lines = [("F2", 15, TITLE), ("SPACER", 8, "")]
    for i, para in enumerate(PARAGRAPHS):
        for wrapped in _wrap(para):
            lines.append(("F1", 11, wrapped))
        if i != len(PARAGRAPHS) - 1:
            lines.append(("SPACER", 6, ""))
    return lines


def build_pdf():
    lines = _build_lines()

    stream_parts = ["BT", "50 742 Td"]
    current_font = None
    for font, size, text in lines:
        if text == "" and font == "SPACER":
            stream_parts.append(f"0 -{size} Td")
            continue
        if font != current_font:
            stream_parts.append(f"/{font} {size} Tf")
            current_font = font
        stream_parts.append(f"{size + 3} TL")
        stream_parts.append(f"({_escape(text)}) Tj")
        stream_parts.append("T*")
    stream_parts.append("ET")
    content_stream = "\n".join(stream_parts).encode("latin-1")

    objects = []
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>")
    objects.append(
        b"<< /Type /Page /Parent 2 0 R /Resources "
        b"<< /Font << /F1 4 0 R /F2 5 0 R >> >> "
        b"/MediaBox [0 0 612 792] /Contents 6 0 R >>"
    )
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
    objects.append(
        ("<< /Length %d >>\nstream\n" % len(content_stream)).encode("latin-1")
        + content_stream
        + b"\nendstream"
    )

    out = bytearray()
    out += b"%PDF-1.4\n"
    offsets = [0]
    for i, body in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode("latin-1")
        out += body
        out += b"\nendobj\n"

    xref_offset = len(out)
    n = len(objects) + 1
    out += f"xref\n0 {n}\n".encode("latin-1")
    out += b"0000000000 65535 f \n"
    for off in offsets[1:]:
        out += f"{off:010d} 00000 n \n".encode("latin-1")
    out += f"trailer\n<< /Size {n} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF".encode("latin-1")
    return bytes(out)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python3 build_pdf.py <out.pdf>", file=sys.stderr)
        sys.exit(1)
    data = build_pdf()
    with open(sys.argv[1], "wb") as f:
        f.write(data)
    print(f"Wrote {sys.argv[1]} ({len(data)} bytes)")
