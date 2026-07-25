# `sandbox-video-probe.elpx` — generator

This folder rebuilds the PoC package **`../sandbox-video-probe.elpx`**: a
multi-page eXeLearning activity that carries several **cross-origin video
embeds** (YouTube, Vimeo, Dailymotion, a generic iframe), an **embedded PDF**,
and a **safe isolation probe** on every page.

The point of the artifact is to show, in one upload, both halves of the
argument:

- **Legit embedded media** (videos, PDF) that authors expect to work.
- **Untrusted author JavaScript** (the probe) that must stay *contained*.

The probe + media are injected **inside `content.xml`** (each page's first
`text` iDevice, both `htmlView` and `jsonProperties.textTextarea`), so the
eXeLearning editor regenerates the pages *with* the content — and the same
block is mirrored into the **exported HTML** so a plain viewer (e.g. the
WordPress content proxy) renders it too.

## Probe interface

The floating panel separates the passive measurements from the opt-in active
demonstrations:

- A prominent summary reports whether the content is **contained**, can
  **reach the LMS/CMS**, or produces an **inconclusive** result.
- Measurements are grouped into collapsible sections to reduce the initial
  panel size.
- Every measurement and active test has contextual help explaining what it
  checks and what risk it represents.
- Active tests have independent status cards. A blocked action is shown as
  **PROTECTED — could not escape the sandbox**; an action that reaches the
  parent is shown as **VULNERABLE — reached the LMS/CMS**.
- The panel can be minimized and uses accessible labels, live status regions,
  keyboard focus indicators, and text labels in addition to color.

The presentation layer lives in `probe-ui.js`; it does not change the passive
probe's safety properties or automatically execute any active demonstration.

## What the probe does (and does not)

`probe.js` has two clearly separated parts:

1. **Isolation measuring instrument (passive, safe).** ~15 boolean checks that
   report *which* capabilities the embedded content has: `isOpaqueOrigin`,
   `canAccessParent`, `canReadParentCookie`, `canFindSesskey`, `canCallScormApi`,
   `canUseLocalStorage`, … Output is **only booleans + redacted error names** —
   never real cookie/token/sesskey values. It performs **no network request,
   no POST, no form submit, and calls no SCORM mutator**.
2. **Didactic demonstration buttons (authorized, reversible, legacy-only).**
   Buttons that attempt visible, reversible actions against the host (Moodle
   course-edit actions; WordPress: change display name / avatar, create sample
   posts and pages). These **only succeed when isolation is OFF** (same-origin /
   legacy iframe) and return **BLOCKED** under an opaque origin — that contrast
   is the whole demonstration.

When served under an opaque-origin sandbox (no `allow-same-origin`), the panel
shows `isOpaqueOrigin: true`, the parent/cookie/storage checks fail with
`SecurityError`, and the demo buttons report blocked. Under a same-origin
(legacy) iframe, the same content reads the host and the buttons act.

> ⚠️ Use only against systems you own / are authorized to test (a local
> `wp-env`, a throwaway Moodle, the Playground blueprint in `../`). It is a
> measuring/teaching instrument for defensive research, not a weapon.

## Inputs (in this folder)

| File | Role |
|------|------|
| `benign-test.elpx` | A clean eXeLearning package used as the **base template**. The build extracts it, injects into it, and re-zips. |
| `probe.js` | The isolation probe described above. |
| `probe-ui.js` | Compact and accessible presentation layer for measurements and active-test results. |
| `build.py` | The generator. |

## Regenerate

Requires **Python 3** only (standard library: `zipfile`, `xml.etree`, `json`).

```bash
cd poc/sandbox-video-probe-src
python3 build.py
# writes ./sandbox-video-probe.elpx (gitignored)
cp sandbox-video-probe.elpx ../sandbox-video-probe.elpx   # refresh the PoC artifact
```

`build.py` will:

1. Extract `benign-test.elpx` into `./build/`.
2. Drop in `probe.js`, `probe-ui.js`, and a tiny embedded `probe-embed.pdf`.
3. Patch each **exported HTML** page (`index.html`, `html/page-*.html`) with the
   media block plus external probe and UI references.
4. Patch **`content.xml`**: append the media block plus inline probe and UI code
   to the first `text` iDevice of each mapped page, so the editor rebuilds the
   pages with it.
5. Re-zip everything into `sandbox-video-probe.elpx`.

The output is byte-for-byte reproducible from the same inputs.

## Page map

The `PAGES` dict in `build.py` controls what goes on each page:

| eXe page | Exported file | Media |
|----------|---------------|-------|
| Page 1 | `index.html` | YouTube (youtube-nocookie) |
| Page 1 - 1 | `html/page-1-1.html` | Vimeo |
| Page 1 - 1 -1 | `html/page-1-1-1.html` | Dailymotion |
| Page 1 - 2 | `html/page-1-2.html` | generic cross-origin iframe (`example.com`) |
| Page 2 | `html/page-2.html` | embedded PDF (package-local) |
| Page 2 - 1 | `html/page-2-1.html` | two embeds (YouTube + Vimeo) |

Edit that dict to add/remove pages or media, then re-run.

## How to exercise it

- **WordPress:** upload `../sandbox-video-probe.elpx`, embed via the block /
  shortcode, and compare the probe panel embedded (opaque → contained) vs. the
  raw content route or legacy mode (same-origin → reaches the host). See the
  Playground blueprint in `../playground-blueprint.json`.
- **eXeLearning editor:** open the `.elpx`; the probe/media are part of the
  project model (`content.xml`), so editing/exporting preserves them.
