import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import playwright from "../evidencias/node_modules/playwright/index.js";

const { chromium } = playwright;

const here = dirname(fileURLToPath(import.meta.url));

const palette = {
  ink: "#172033",
  muted: "#536174",
  line: "#8a97a8",
  panel: "#f7f8fa",
  blue: "#234a73",
  blueFill: "#edf3f9",
  red: "#9d2f2c",
  redFill: "#fbefee",
  green: "#2f6846",
  greenFill: "#edf6f0",
  amber: "#9a5b16",
  amberFill: "#fff4e2",
  white: "#ffffff",
};

function esc(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function lines(items, x, y, cls = "text", gap = 24, anchor = "start") {
  return items
    .map((text, index) => `<text class="${cls}" x="${x}" y="${y + index * gap}" text-anchor="${anchor}">${esc(text)}</text>`)
    .join("\n");
}

function pill(x, y, w, text, cls = "pill") {
  return `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="34" rx="17"/><text class="pillText" x="${x + w / 2}" y="${y + 22}" text-anchor="middle">${esc(text)}</text>`;
}

function commonDefs() {
  return `
  <defs>
    <style>
      .bg{fill:#fff}
      .frame{fill:${palette.white};stroke:${palette.line};stroke-width:1.6}
      .panel{fill:${palette.panel};stroke:${palette.line};stroke-width:1.4}
      .lms{fill:${palette.blueFill};stroke:${palette.blue};stroke-width:1.7}
      .risk{fill:${palette.redFill};stroke:${palette.red};stroke-width:1.8}
      .safe{fill:${palette.greenFill};stroke:${palette.green};stroke-width:1.8}
      .media{fill:${palette.amberFill};stroke:${palette.amber};stroke-width:1.8}
      .ghost{fill:#f3f5f8;stroke:${palette.line};stroke-width:1.4;stroke-dasharray:8 6}
      .title{font-family:Georgia,'Times New Roman',serif;font-size:31px;font-weight:700;fill:${palette.ink}}
      .subtitle{font-family:Arial,Helvetica,sans-serif;font-size:18px;fill:${palette.muted}}
      .h{font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:700;fill:${palette.ink}}
      .hSmall{font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;fill:${palette.ink}}
      .text{font-family:Arial,Helvetica,sans-serif;font-size:18px;fill:${palette.ink}}
      .small{font-family:Arial,Helvetica,sans-serif;font-size:15.5px;fill:${palette.muted}}
      .mono{font-family:Menlo,Consolas,monospace;font-size:15px;fill:${palette.ink}}
      .riskText{fill:${palette.red}}
      .safeText{fill:${palette.green}}
      .blueText{fill:${palette.blue}}
      .amberText{fill:${palette.amber}}
      .line{stroke:${palette.line};stroke-width:2;fill:none}
      .arrowBlue{stroke:${palette.blue};stroke-width:2.2;fill:none}
      .arrowGreen{stroke:${palette.green};stroke-width:2.2;fill:none}
      .arrowGray{stroke:${palette.line};stroke-width:1.8;fill:none;stroke-dasharray:7 6}
      .icon{fill:none;stroke:${palette.ink};stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
      .iconSafe{fill:none;stroke:${palette.green};stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
      .iconRisk{fill:none;stroke:${palette.red};stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
      .pill{fill:#e8edf3;stroke:#c5ced8;stroke-width:1}
      .pillText{font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;fill:${palette.ink}}
    </style>
    <marker id="arrowBlue" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="${palette.blue}"/></marker>
    <marker id="arrowGreen" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="${palette.green}"/></marker>
    <marker id="arrowGray" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10z" fill="${palette.line}"/></marker>
  </defs>`;
}

const i18n = {
  en: {
    archTitleA: "(a) Same origin: no isolation",
    archSubA: "Untrusted content executes inside the platform origin",
    archTitleB: "(b) Opaque origin: isolated",
    archSubB: "The sandbox creates a separate, opaque execution origin",
    lms: "LMS / platform",
    origin: "origin https://lms",
    platform: "Platform state",
    user: ["Authenticated", "user"],
    session: ["Session", "cookies"],
    dom: ["DOM, forms", "sesskey"],
    api: ["APIs", "and data"],
    embedded: "Embedded content",
    sameOrigin: "same origin",
    opaque: "opaque origin",
    authorJs: "Author JavaScript",
    fullAccess: "Full access",
    fullBullets: ["reads DOM, cookies and sesskey", "forges authenticated requests"],
    restricted: "Restricted channel",
    restrictedBullets: ["no DOM, cookie or API access", "only validated messages"],
    resultRisk: "Result: content acts as part of the platform.",
    resultRisk2: "High impact when the content is untrusted.",
    resultSafe: "Result: content remains isolated from the platform.",
    resultSafe2: ["Interactivity and SCORM tracking stay available", "through the bridge."],
    bridge: "postMessage",
    bridgeSub: "validated",
    csp: "CSP boundary",
    cspValue: "object-src 'none'; base-uri 'none'; sandbox",
    overlayTitle: "Promoting a cross-origin media embed from an opaque sandbox",
    page: "LMS authenticated page",
    iframe: "Content iframe",
    sandbox: "sandbox without allow-same-origin",
    nullOrigin: "origin = null (opaque)",
    placeholder: "External-video placeholder",
    placeholderSub: ["geometry only", "the opaque iframe cannot load", "the cross-origin player"],
    relay: "Parent relay",
    relayFile: "exe_embed_relay.js",
    relaySub: ["outside the sandbox", "validates https and cross-origin", "then promotes the embed"],
    player: "Real player iframe",
    playerSub: ["youtube.com (cross-origin)", "SOP-isolated from the LMS"],
    msg: "postMessage",
    msgSub: ["provider URL", "+ geometry"],
    promote: "promote + overlay",
    sameGeom: "same geometry",
    overlayNote: "The promoted player is cross-origin: it cannot read LMS state under SOP.",
  },
  es: {
    archTitleA: "(a) Mismo origen: sin aislamiento",
    archSubA: "El contenido no confiable se ejecuta en el origen de la plataforma",
    archTitleB: "(b) Origen opaco: aislado",
    archSubB: "El sandbox crea un origen de ejecución separado y opaco",
    lms: "LMS / plataforma",
    origin: "origen https://lms",
    platform: "Estado de la plataforma",
    user: ["Usuario", "autenticado"],
    session: ["Sesión", "cookies"],
    dom: ["DOM, formularios", "sesskey"],
    api: ["APIs", "y datos"],
    embedded: "Contenido incrustado",
    sameOrigin: "mismo origen",
    opaque: "origen opaco",
    authorJs: "JavaScript de autor",
    fullAccess: "Acceso total",
    fullBullets: ["lee DOM, cookies y sesskey", "forja peticiones autenticadas"],
    restricted: "Canal restringido",
    restrictedBullets: ["sin acceso a DOM, cookies o API", "solo mensajes validados"],
    resultRisk: "Resultado: el contenido actúa como parte de la plataforma.",
    resultRisk2: "Alto impacto si el contenido no es confiable.",
    resultSafe: "Resultado: el contenido queda aislado de la plataforma.",
    resultSafe2: ["La interactividad y el tracking SCORM se preservan", "mediante el puente."],
    bridge: "postMessage",
    bridgeSub: "validado",
    csp: "Límite CSP",
    cspValue: "object-src 'none'; base-uri 'none'; sandbox",
    overlayTitle: "Promoción de un vídeo cross-origin desde un sandbox opaco",
    page: "Página autenticada del LMS",
    iframe: "Iframe de contenido",
    sandbox: "sandbox sin allow-same-origin",
    nullOrigin: "origen = null (opaco)",
    placeholder: "Hueco de vídeo externo",
    placeholderSub: ["solo geometría", "el iframe opaco no puede cargar", "el reproductor cross-origin"],
    relay: "Relé del padre",
    relayFile: "exe_embed_relay.js",
    relaySub: ["fuera del sandbox", "valida https y cross-origin", "después promueve el embed"],
    player: "Iframe del reproductor real",
    playerSub: ["youtube.com (cross-origin)", "aislado del LMS por la SOP"],
    msg: "postMessage",
    msgSub: ["URL del proveedor", "+ geometría"],
    promote: "promueve + superpone",
    sameGeom: "misma geometría",
    overlayNote: "El reproductor promovido es cross-origin: no puede leer el estado del LMS por la SOP.",
  },
};

function stateItem(x, y, label, icon) {
  return `
    <g transform="translate(${x} ${y})">
      ${icon}
      ${lines(label, 58, 15, "text", 25)}
    </g>`;
}

function userIcon() {
  return `<circle class="icon" cx="20" cy="14" r="10"/><path class="icon" d="M3 48C7 28 33 28 37 48"/>`;
}

function dbIcon() {
  return `<ellipse class="icon" cx="20" cy="11" rx="17" ry="7"/><path class="icon" d="M3 11V45C3 54 37 54 37 45V11"/><path class="icon" d="M3 28C3 37 37 37 37 28"/>`;
}

function docIcon() {
  return `<path class="icon" d="M7 4H30L42 16V50H7Z"/><path class="icon" d="M30 4V17H42"/><path class="icon" d="M15 27H34M15 36H34"/>`;
}

function apiIcon() {
  return `<circle class="icon" cx="17" cy="17" r="12"/><path class="icon" d="M27 27L48 48M40 40L33 47M48 48L41 55"/>`;
}

function secureModeArchitecture(lang) {
  const t = i18n[lang];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" role="img" aria-labelledby="title desc">
  <title id="title">${esc(t.archTitleA)} / ${esc(t.archTitleB)}</title>
  <desc id="desc">${esc(t.archSubA)}. ${esc(t.archSubB)}.</desc>
  ${commonDefs()}
  <rect class="bg" x="0" y="0" width="1600" height="900"/>

  <text class="title" x="400" y="54" text-anchor="middle">${esc(t.archTitleA)}</text>
  <text class="subtitle" x="400" y="84" text-anchor="middle">${esc(t.archSubA)}</text>
  <text class="title" x="1200" y="54" text-anchor="middle">${esc(t.archTitleB)}</text>
  <text class="subtitle" x="1200" y="84" text-anchor="middle">${esc(t.archSubB)}</text>

  <rect class="panel" x="48" y="116" width="704" height="568" rx="10"/>
  <rect class="panel" x="848" y="116" width="704" height="568" rx="10"/>
  <text class="hSmall blueText" x="400" y="153" text-anchor="middle">${esc(t.lms)} · ${esc(t.origin)}</text>
  <text class="hSmall blueText" x="1200" y="153" text-anchor="middle">${esc(t.lms)} · ${esc(t.origin)}</text>

  <rect class="lms" x="84" y="190" width="292" height="420" rx="8"/>
  <text class="h" x="230" y="230" text-anchor="middle">${esc(t.platform)}</text>
  ${stateItem(116, 258, t.user, userIcon())}
  ${stateItem(114, 338, t.session, dbIcon())}
  ${stateItem(116, 424, t.dom, docIcon())}
  ${stateItem(112, 512, t.api, apiIcon())}

  <rect class="risk" x="520" y="214" width="196" height="246" rx="8"/>
  <text class="hSmall riskText" x="618" y="250" text-anchor="middle">${esc(t.embedded)}</text>
  <text class="h" x="618" y="292" text-anchor="middle">&lt;iframe&gt;</text>
  <text class="small" x="618" y="322" text-anchor="middle">${esc(t.sameOrigin)}</text>
  <text class="h riskText" x="618" y="388" text-anchor="middle" font-size="42">&lt;/&gt;</text>
  <text class="text" x="618" y="425" text-anchor="middle">${esc(t.authorJs)}</text>
  <path class="arrowBlue" d="M376 338H520" marker-start="url(#arrowBlue)" marker-end="url(#arrowBlue)"/>
  <text class="hSmall riskText" x="398" y="510">${esc(t.fullAccess)}</text>
  ${lines(t.fullBullets.map((v) => `- ${v}`), 398, 542, "text", 31)}

  <rect class="risk" x="48" y="720" width="704" height="116" rx="9"/>
  <g transform="translate(88 744)"><path class="iconRisk" d="M33 4L64 62H2Z"/><path class="iconRisk" d="M33 22V42"/><circle fill="${palette.red}" cx="33" cy="52" r="3.3"/></g>
  <text class="hSmall" x="176" y="765">${esc(t.resultRisk)}</text>
  <text class="text" x="176" y="799">${esc(t.resultRisk2)}</text>

  <rect class="lms" x="884" y="190" width="292" height="420" rx="8"/>
  <text class="h" x="1030" y="230" text-anchor="middle">${esc(t.platform)}</text>
  ${stateItem(916, 258, t.user, userIcon())}
  ${stateItem(914, 338, t.session, dbIcon())}
  ${stateItem(916, 424, t.dom, docIcon())}
  ${stateItem(912, 512, t.api, apiIcon())}

  <rect class="safe" x="1300" y="214" width="216" height="246" rx="8"/>
  <text class="hSmall safeText" x="1408" y="250" text-anchor="middle">${esc(t.embedded)}</text>
  <text class="h" x="1408" y="292" text-anchor="middle">&lt;iframe sandbox&gt;</text>
  <text class="small" x="1408" y="322" text-anchor="middle">${esc(t.opaque)}</text>
  <text class="h safeText" x="1408" y="388" text-anchor="middle" font-size="42">&lt;/&gt;</text>
  <text class="text" x="1408" y="425" text-anchor="middle">${esc(t.authorJs)}</text>

  <path class="arrowGreen" d="M1176 338H1300" stroke-dasharray="9 8" marker-start="url(#arrowGreen)" marker-end="url(#arrowGreen)"/>
  <text class="hSmall safeText" x="1237" y="286" text-anchor="middle">${esc(t.bridge)}</text>
  <text class="small safeText" x="1237" y="310" text-anchor="middle">(${esc(t.bridgeSub)})</text>
  <g transform="translate(1216 374)"><path class="iconSafe" d="M22 3L42 12V33C42 50 30 61 22 66C14 61 2 50 2 33V12Z"/><path class="iconSafe" d="M13 34L20 42L33 25"/></g>
  <text class="hSmall safeText" x="1198" y="510">${esc(t.restricted)}</text>
  ${lines(t.restrictedBullets.map((v) => `- ${v}`), 1198, 542, "text", 31)}

  <rect class="safe" x="960" y="620" width="512" height="58" rx="8"/>
  <text class="mono" x="984" y="643">${esc(t.csp)}: object-src 'none'; base-uri 'none';</text>
  <text class="mono" x="984" y="665">sandbox</text>

  <rect class="safe" x="848" y="720" width="704" height="116" rx="9"/>
  <g transform="translate(888 740)"><path class="iconSafe" d="M34 4L66 17V48C66 71 46 84 34 90C22 84 2 71 2 48V17Z"/><path class="iconSafe" d="M21 48L31 58L49 34"/></g>
  <text class="hSmall" x="988" y="765">${esc(t.resultSafe)}</text>
  ${lines(t.resultSafe2, 988, 799, "text", 26)}
</svg>`;
}

function embedOverlay(lang) {
  const t = i18n[lang];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 620" role="img" aria-labelledby="title desc">
  <title id="title">${esc(t.overlayTitle)}</title>
  <desc id="desc">${esc(t.overlayNote)}</desc>
  ${commonDefs()}
  <rect class="bg" x="0" y="0" width="1200" height="620"/>
  <text class="title" x="600" y="52" text-anchor="middle">${esc(t.overlayTitle)}</text>

  <rect class="frame" x="44" y="84" width="1112" height="468" rx="12"/>
  <text class="hSmall blueText" x="72" y="122">${esc(t.page)}</text>
  <text class="small" x="72" y="148">${esc(t.origin)}</text>

  <rect class="safe" x="82" y="184" width="422" height="300" rx="9"/>
  <text class="hSmall safeText" x="106" y="220">${esc(t.iframe)}</text>
  <text class="small" x="106" y="248">${esc(t.sandbox)}</text>
  <text class="small" x="106" y="272">${esc(t.nullOrigin)}</text>
  <rect class="ghost" x="126" y="306" width="334" height="130" rx="8"/>
  <circle cx="214" cy="371" r="28" fill="#c8d1dc"/>
  <path d="M205 354L205 388L234 371Z" fill="#fff"/>
  <text class="hSmall" x="310" y="352" text-anchor="middle">${esc(t.placeholder)}</text>
  ${lines(t.placeholderSub, 310, 382, "small", 22, "middle")}

  <rect class="lms" x="690" y="164" width="372" height="158" rx="9"/>
  <text class="hSmall blueText" x="720" y="208">${esc(t.relay)}</text>
  <text class="mono" x="720" y="234">${esc(t.relayFile)}</text>
  ${lines(t.relaySub, 720, 264, "small", 22)}

  <rect class="media" x="708" y="386" width="334" height="118" rx="9"/>
  <circle cx="764" cy="445" r="27" fill="${palette.amber}"/>
  <path d="M755 428L755 462L784 445Z" fill="#fff"/>
  <text class="hSmall amberText" x="818" y="428">${esc(t.player)}</text>
  ${lines(t.playerSub, 818, 458, "small", 22)}

  <path class="arrowGreen" d="M504 280C582 250 624 231 690 225" marker-end="url(#arrowGreen)"/>
  <rect class="pill" x="510" y="219" width="152" height="34" rx="17"/>
  <text class="pillText" x="586" y="241" text-anchor="middle">${esc(t.msg)}</text>
  ${lines(t.msgSub, 586, 304, "small", 21, "middle")}

  <path class="arrowBlue" d="M876 322V386" marker-end="url(#arrowBlue)"/>
  <text class="small blueText" x="897" y="360">${esc(t.promote)}</text>

  <path class="arrowGray" d="M700 456C620 490 520 484 460 426" marker-end="url(#arrowGray)"/>
  ${pill(502, 462, lang === "es" ? 164 : 136, t.sameGeom)}

  <rect class="panel" x="72" y="568" width="1056" height="34" rx="7"/>
  <text class="small" x="600" y="591" text-anchor="middle">${esc(t.overlayNote)}</text>
</svg>`;
}

async function renderPng(svgPath, pngPath) {
  const svg = await readFile(svgPath, "utf8");
  const match = svg.match(/viewBox="[^"]*\s(\d+(?:\.\d+)?)\s(\d+(?:\.\d+)?)"/);
  if (!match) {
    throw new Error(`Missing viewBox dimensions in ${svgPath}`);
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  const sizedSvg = svg.replace("<svg ", `<svg width="${width}" height="${height}" `);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
  await page.setContent(`<!doctype html>
    <html>
      <head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}</style></head>
      <body>${sizedSvg}</body>
    </html>`);
  await page.locator("svg").screenshot({ path: pngPath, omitBackground: false });
  await browser.close();
}

const outputs = [
  ["secure-mode-architecture.en", secureModeArchitecture("en")],
  ["secure-mode-architecture.es", secureModeArchitecture("es")],
  ["embed-overlay.en", embedOverlay("en")],
  ["embed-overlay.es", embedOverlay("es")],
];

for (const [name, svg] of outputs) {
  await writeFile(resolve(here, `${name}.svg`), svg);
}

for (const [name] of outputs) {
  await renderPng(resolve(here, `${name}.svg`), resolve(here, `${name}.png`));
}
