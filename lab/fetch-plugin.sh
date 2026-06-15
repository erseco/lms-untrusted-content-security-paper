#!/usr/bin/env bash
# SPDX-License-Identifier: MIT
#
# Materialise the mod_exelearning plugin at a PINNED commit into lab/mod_exelearning/
# (gitignored), so the lab is reproducible without a separate checkout. The matrix
# needs the secure-iframe branch, where `iframemode` selects secure|legacy.
#
# Source resolution (first that works):
#   1. PLUGIN_SRC  — a local git checkout to `git archive` the pinned ref from (no network).
#   2. PLUGIN_REPO — clone over HTTPS and fetch the pinned ref.
#
# Env (all optional):
#   PLUGIN_REF   pinned commit/branch/tag           (default: 73fe6ff)
#   PLUGIN_REPO  https remote                        (default: github.com/ateeducacion/mod_exelearning)
#   PLUGIN_SRC   local git dir to archive from       (default: ../../mod_exelearning if it has the ref)
#   DEST         destination dir                     (default: ./mod_exelearning)
#   FORCE=1      re-materialise even if DEST exists
set -euo pipefail
cd "$(dirname "$0")"

PLUGIN_REF="${PLUGIN_REF:-73fe6ff}"
PLUGIN_REPO="${PLUGIN_REPO:-https://github.com/ateeducacion/mod_exelearning.git}"
DEST="${DEST:-mod_exelearning}"
STAMP="$DEST/.pinned-ref"

# Default local source: the sibling checkout, but only if it actually has the ref.
if [ -z "${PLUGIN_SRC:-}" ] && [ -d ../../mod_exelearning/.git ] \
   && git -C ../../mod_exelearning cat-file -e "${PLUGIN_REF}^{commit}" 2>/dev/null; then
  PLUGIN_SRC=../../mod_exelearning
fi

want="$(cd "${PLUGIN_SRC:-.}" 2>/dev/null && git rev-parse --verify -q "${PLUGIN_REF}^{commit}" 2>/dev/null || echo "$PLUGIN_REF")"

if [ -f "$STAMP" ] && [ "${FORCE:-0}" != "1" ] && grep -q "$want" "$STAMP" 2>/dev/null; then
  echo "Plugin already pinned at $(cat "$STAMP") in $DEST/ (FORCE=1 to refresh)."
  exit 0
fi

rm -rf "$DEST"
mkdir -p "$DEST"

if [ -n "${PLUGIN_SRC:-}" ] && git -C "$PLUGIN_SRC" cat-file -e "${PLUGIN_REF}^{commit}" 2>/dev/null; then
  resolved="$(git -C "$PLUGIN_SRC" rev-parse "${PLUGIN_REF}^{commit}")"
  echo "Archiving mod_exelearning ${resolved} from local $PLUGIN_SRC ..."
  git -C "$PLUGIN_SRC" archive --format=tar "$resolved" | tar -x -C "$DEST"
else
  echo "Cloning mod_exelearning ${PLUGIN_REF} from $PLUGIN_REPO ..."
  git init -q "$DEST"
  git -C "$DEST" remote add origin "$PLUGIN_REPO"
  # Try fetching the exact SHA (GitHub allows it); fall back to the known feature branch.
  if ! git -C "$DEST" fetch -q --depth 1 origin "$PLUGIN_REF" 2>/dev/null; then
    echo "Direct SHA fetch unavailable; fetching feature/secure-iframe-scorm-bridge ..."
    git -C "$DEST" fetch -q --depth 50 origin feature/secure-iframe-scorm-bridge
  fi
  git -C "$DEST" checkout -q "$PLUGIN_REF" 2>/dev/null || git -C "$DEST" checkout -q FETCH_HEAD
  resolved="$(git -C "$DEST" rev-parse HEAD)"
  rm -rf "$DEST/.git"
fi

echo "$resolved" > "$STAMP"
echo "Pinned mod_exelearning at $resolved -> $DEST/"
