/*
 * CSS del panel. Vive dentro del shadow root: el tema del anfitrión no puede
 * pisarlo ni al revés, así que no hace falta el frágil `all: initial`.
 *
 * Tema único, siempre claro. El panel es un instrumento de medida superpuesto
 * sobre páginas ajenas: su aspecto no puede depender del esquema de color del
 * sistema operativo de quien mira, o las capturas de pantalla del artículo
 * dejarían de ser comparables entre sí. Las vistas (checks-view.js,
 * demos-view.js) ya fijan sus propios colores claros en línea; seguir un
 * `prefers-color-scheme: dark` aquí solo oscurecía el cascarón y dejaba esos
 * colores de vista ilegibles encima (texto gris sobre fondo negro).
 */
export const PANEL_CSS = `
:host{all:initial}
:host([data-presentation="embedded"]){display:block;width:100%}
*,*::before,*::after{box-sizing:border-box}
#exe-poc-panel{display:flex;flex-direction:column;width:min(420px,94vw);max-height:86vh;
  font:12.5px/1.45 system-ui,-apple-system,"Segoe UI",Arial,sans-serif;color:#16191d;
  background:#fff;border:1px solid #c9ced6;border-radius:10px;
  box-shadow:0 12px 38px rgba(0,0,0,.32);overflow:hidden;overflow-wrap:anywhere}
:host([data-presentation="embedded"]) #exe-poc-panel{width:100%;max-height:none;
  border-radius:8px;box-shadow:none}
:host([data-presentation="embedded"]) #exe-poc-body{overflow:visible}
:host([data-presentation="embedded"]) .hd{cursor:default;touch-action:auto}
:host([data-presentation="embedded"]) :is(#exe-poc-float,#exe-poc-minimize,#exe-poc-close){
  display:none}
.hd{display:flex;align-items:center;gap:6px;padding:8px 10px;background:#f3f5f8;
  border-bottom:1px solid #e2e6ec;cursor:grab;touch-action:none}
.hd:active{cursor:grabbing}
.hd h2{margin:0;font-size:13px;font-weight:600;flex:1;min-width:0}
.hd p{margin:1px 0 0;font-size:10.5px;color:#5a6068;font-weight:400}
.hd button{border:1px solid #c9ced6;background:#fff;border-radius:5px;cursor:pointer;
  padding:1px 7px;font:inherit;color:#333}
.hd button:hover,.hd button:focus-visible{background:#eaf2fa;border-color:#0b57d0;
  outline:2px solid #8db8df;outline-offset:1px}
#exe-poc-body{overflow:auto;padding:10px 11px 12px}
#exe-poc-body[hidden]{display:none}
.aviso{margin:0;padding:7px 10px;background:#fff6e5;border-bottom:1px solid #e6d9b8;
  color:#8a5600;font-size:11px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

/*
 * Colocación del host. Cada esquina es una variante; `anchored` deja el panel en
 * el flujo del documento, sin position fixed.
 */
export const PLACEMENT_CSS = {
  tr: 'position:fixed;top:12px;right:12px;z-index:2147483647',
  br: 'position:fixed;bottom:12px;right:12px;z-index:2147483647',
  bl: 'position:fixed;bottom:12px;left:12px;z-index:2147483647',
  tl: 'position:fixed;top:12px;left:12px;z-index:2147483647',
  anchored: 'position:static;display:block;margin:16px 0;z-index:auto',
};
