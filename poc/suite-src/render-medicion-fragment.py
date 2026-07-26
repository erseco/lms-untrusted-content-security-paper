#!/usr/bin/env python3
"""Emite la tabla de medición compartida por evil.elpx y evil-page.html."""

import sys

from exelib import SUITE_CSS, medicion_shell_html


if len(sys.argv) != 2 or sys.argv[1] not in {"css", "html"}:
    print("usage: render-medicion-fragment.py css|html", file=sys.stderr)
    sys.exit(2)

print(SUITE_CSS if sys.argv[1] == "css" else medicion_shell_html())
