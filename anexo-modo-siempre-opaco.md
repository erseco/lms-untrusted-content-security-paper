# Annex — Simplified editor preview trust boundaries

> Status: architecture implemented on local `feature/simplified-opaque-iframe`
> branches for evaluation. This annex replaces the earlier protocol-v2 design;
> it does not change the evidence for published-content isolation in the paper.

## 1. Normal editor preview

The regular web editor, server editor, static/PWA build, Electron application,
and PHP-WASM playground keep eXeLearning's established preview transport.
Official runtime code, iDevice JavaScript, themes, MathJax, and maintained
libraries execute normally.

Only author-controlled HTML is transformed at the last safe boundary before it
is combined with trusted output. A parser-based policy detects scripts, event
handlers, active URLs, `srcdoc`, unsafe iframes, object/embed/applet, active SVG
and XML, meta refresh, base elements, privileged form actions, and legacy HTML
imports. The result records categories and actions for the UI. Stored Yjs data,
saved projects, reopened projects, and exported packages retain the original
content byte-for-byte at this layer.

When active content is found, an accessible warning offers an explicit enable
or disable action. Authorization is scoped to the current project and process
session; opening another project does not inherit it. Enabling is a trust
decision, not a security guarantee.

## 2. Embedded LMS/CMS preview

An embedded editor renders its complete preview inside an iframe sandbox that
omits `allow-same-origin`. The child therefore cannot read the host DOM,
cookies, storage, CSRF tokens, JavaScript objects, or authenticated APIs.

The minimal host contract is:

1. The editor generates one complete ZIP snapshot.
2. An authenticated, CSRF-protected, owner/project-scoped route stores or
   replaces it and returns an unguessable capability.
3. A cookieless route serves `/preview/{capability}/index.html` and assets.
4. Scriptable MIME types receive a response-level sandbox CSP plus hardening
   headers.
5. Paths and MIME types are validated; capabilities expire and are cleaned up.
6. `postMessage` accepts closed payload shapes only and verifies
   `event.source`; opaque origins make `event.origin === "null"` expected.

No silent fallback may render embedded content same-origin. The contract does
not include layered fixed/session/generated assets, atomic incremental
revisions, conflict recovery, external-media geometry relays, or transport
selection matrices. Updates replace the complete snapshot.

## 3. Published content

Published or delivered packages have a separate threat model. Some platforms
serve them through an opaque iframe and validated tracking bridge; others retain
same-origin compatibility. Preview filtering must not be described as changing
the exported package or as protecting delivery contexts.

## 4. Electron

Electron increases impact because preload bridges can expose filesystem, shell,
dialog, configuration, or IPC operations. Context isolation does not prevent a
same-origin child from referring to a privileged bridge on its parent window.
The simplified decision therefore disables explicit author-active-content
authorization in Electron while retaining first-party preview JavaScript. A
future implementation may enable it only in separate `webContents` with no
privileged preload.

## 5. Security claims and limitations

Source-aware filtering and opaque-origin isolation are complementary, not
equivalent. Filtering can miss an author-controlled insertion point; opaque
isolation protects the host origin even when authored code runs. Conversely,
opaque sandboxing does not stop all network requests, tracking, phishing, or
social engineering. Capability URLs are bearer secrets until expiry, and host
plugins still need bounded storage, cleanup, path validation, CSRF enforcement,
and browser-level integration tests.
