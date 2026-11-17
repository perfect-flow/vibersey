// Renders one print panel (front, back, sleeve) of a jersey as SVG.
//
// This single function drives both the in-browser preview and the server-side
// print files sent to Printful, so the printed jersey matches the preview.
// The artwork, colors and fonts come from the saved DesignSpec; only the
// player's name and number vary between team members.

import { STANDARDS, LOGO_SPOTS, DEFAULT_LOGO_POSITION, productByKey, type LayoutBox, type Placement } from "./catalog";
import { FONTS, type DesignSpec, type Player } from "./design-spec";
import { PROCEDURAL, texture } from "./patterns";
import { contrast, tone } from "./color";
import { pieceFor } from "./garments";

export type RenderOptions = {
  width: number;
  height: number;
  player: Player;
  // map a stored URL to what the SVG should reference (data URI on the server)
  resolveImage?: (url: string) => string | undefined;
  // draw a faint outline of the garment edge, preview only
  guides?: boolean;
  // unique prefix for element ids when several renders share one page
  idPrefix?: string;
};

// The fabric piece's box inside the print file (fractions). Layout boxes and
// trims are placed relative to it, because everything outside it is cut away.
type PBox = { x: number; y: number; w: number; h: number };
function pieceBox(spec: DesignSpec, placement: Placement): PBox {
  const [x, y, w, h] = pieceFor(spec.product, placement).box;
  return { x, y, w, h };
}
const inPiece = (b: LayoutBox, pb: PBox): LayoutBox => ({
  x: pb.x + b.x * pb.w,
  y: pb.y + b.y * pb.h,
  h: b.h * pb.h,
  w: b.w !== undefined ? b.w * pb.w : undefined,
});
// long sleeves (hockey) are taller than wide; short sleeves are a wide cap
export function isLongSleeve(spec: DesignSpec, placement: Placement) {
  const p = pieceFor(spec.product, placement);
  return p.box[3] * p.dims.height > 0.75 * p.box[2] * p.dims.width;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// rough average glyph width/height ratio per font, used to keep text inside its box
const WIDTH_RATIO: Record<string, number> = {
  graduate: 0.78, bebas: 0.42, oswald: 0.5, anton: 0.48, teko: 0.42, yellowtail: 0.55, blackops: 0.75,
  alfaslab: 0.8, bowlby: 0.85, bungee: 0.8, russo: 0.72, staatliches: 0.5, squada: 0.5, racing: 0.62,
  kanit: 0.66, rubikmono: 1.0, marker: 0.62, pacifico: 0.6,
};
const CAP_RATIO = 0.72; // cap height as a fraction of font-size

function fitFontSize(text: string, font: string, box: LayoutBox, W: number, H: number) {
  let size = (box.h * H) / CAP_RATIO;
  if (box.w && text.length) {
    const maxW = box.w * W;
    const est = text.length * size * (WIDTH_RATIO[font] ?? 0.6);
    if (est > maxW) size *= maxW / est;
  }
  return size;
}

function textEl(opts: {
  id: string;
  text: string;
  font: keyof typeof FONTS;
  box: LayoutBox;
  W: number;
  H: number;
  fill: string;
  stroke: string;
  outline: number;
  arch?: boolean;
  effect?: DesignSpec["lettering"]["effect"];
  inner?: string; // inner outline color for the double effect
}) {
  const { id, text, font, box, W, H, fill, stroke, outline, arch } = opts;
  if (!text) return "";
  const effect = opts.effect ?? "single";
  const f = FONTS[font];
  const size = fitFontSize(text, font, box, W, H);
  const cx = box.x * W;
  const baseline = box.y * H + (size * CAP_RATIO) / 2;
  const sw = size * outline * 2;
  const common = `font-family="${f.family}" font-size="${size.toFixed(1)}"${
    "weight" in f ? ` font-weight="${f.weight}"` : ""
  }${"italic" in f ? ` font-style="italic"` : ""} stroke-linejoin="round" paint-order="stroke" text-anchor="middle"`;
  let defs = "";
  let pos = `x="${cx.toFixed(1)}" y="${baseline.toFixed(1)}"`;
  let content = esc(text);
  if (arch) {
    // gentle upward arch, like a classic varsity chest wordmark
    const half = ((box.w ?? 0.6) * W) / 2;
    const rise = size * 0.55;
    const d = `M ${cx - half} ${baseline + rise} Q ${cx} ${baseline - rise} ${cx + half} ${baseline + rise}`;
    defs = `<path id="${id}" d="${d}" fill="none"/>`;
    pos = "";
    content = `<textPath href="#${id}" startOffset="50%">${esc(text)}</textPath>`;
  }
  const layer = (fl: string, st: string, w: number) =>
    `<text ${pos} ${common} fill="${fl}" stroke="${st}" stroke-width="${w.toFixed(1)}">${content}</text>`;
  const double = effect === "double" || effect === "double-shadow";
  const shadow = effect === "shadow" || effect === "double-shadow";
  const outerW = double ? sw * 1.9 : sw;
  const layers: string[] = [];
  if (shadow) {
    const off = size * 0.055;
    layers.push(`<g transform="translate(${(off * 0.7).toFixed(1)} ${off.toFixed(1)})" opacity="0.9">${layer(stroke, stroke, outerW)}</g>`);
  }
  if (double) {
    // pro tackle-twill look: outer outline, then a thinner inner ring
    layers.push(layer(stroke, stroke, outerW));
    layers.push(layer(fill, opts.inner ?? stroke, sw * 0.95));
  } else layers.push(layer(fill, stroke, sw));
  return defs + layers.join("");
}

// Inner ring color for double outlines: the accent, unless it would vanish
// against the fill or the outer outline.
function innerRing(spec: DesignSpec) {
  const { accent, text, outline, primary } = spec.colors;
  if (contrast(accent, text) >= 1.6 && contrast(accent, outline) >= 1.3) return accent;
  if (contrast(primary, text) >= 1.6 && contrast(primary, outline) >= 1.3) return primary;
  return contrast(text, "#000000") > contrast(text, "#FFFFFF") ? "#000000" : "#FFFFFF";
}

function background(spec: DesignSpec, placement: Placement, W: number, H: number, resolveImage?: RenderOptions["resolveImage"], idp = "") {
  const { primary, secondary, accent } = spec.colors;
  // the shoulder piece: the contrasting yoke color, or the body graphic
  if (placement === "yoke" && spec.trim.yoke) return `<rect width="${W}" height="${H}" fill="${secondary}"/>`;
  const parts: string[] = [`<rect width="${W}" height="${H}" fill="${primary}"/>`];
  const p = spec.pattern;
  const proc = PROCEDURAL[p.style];
  // body-shaped graphics (bands across the torso) don't belong on a separate shoulder piece
  const bodyOnly = placement === "yoke" && ["sash", "chevron", "waves"].includes(p.style);
  if (proc && !bodyOnly) {
    const tonal = p.tone === "tonal";
    // drawn in the fabric piece's own box so graphics line up with the real garment
    const gb = pieceBox(spec, placement);
    parts.push(
      `<g opacity="${p.opacity}" transform="translate(${(gb.x * W).toFixed(1)} ${(gb.y * H).toFixed(1)})">${proc({
        W: gb.w * W, H: gb.h * H, placement, primary,
        c1: tonal ? tone(primary, 0.14) : secondary,
        c2: tonal ? tone(primary, 0.28) : accent,
        seed: p.seed ?? 1,
        scale: p.scale ?? 1,
        idp: `${idp}${placement}`,
      })}</g>`
    );
  }
  switch (p.style) {
    case "stripes": {
      const n = 7;
      const sw = W / (n * 2);
      for (let i = 0; i < n; i++)
        parts.push(`<rect x="${(i * 2 + 0.5) * sw}" y="0" width="${sw}" height="${H}" fill="${secondary}" opacity="${p.opacity}"/>`);
      break;
    }
    case "pinstripes": {
      const gap = W / 28;
      for (let x = gap / 2; x < W; x += gap)
        parts.push(`<rect x="${x}" y="0" width="${Math.max(2, W / 600)}" height="${H}" fill="${secondary}" opacity="${p.opacity}"/>`);
      break;
    }
    case "hoops": {
      const n = 6;
      const bh = H / (n * 2);
      for (let i = 0; i < n; i++)
        parts.push(`<rect x="0" y="${(i * 2 + 1) * bh}" width="${W}" height="${bh}" fill="${secondary}" opacity="${p.opacity}"/>`);
      break;
    }
    case "gradient":
      parts.push(
        `<defs><linearGradient id="${idp}g-${placement}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${primary}"/><stop offset="1" stop-color="${secondary}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#${idp}g-${placement})" opacity="${p.opacity}"/>`
      );
      break;
    case "artwork": {
      const href = p.artworkUrl ? (resolveImage ? resolveImage(p.artworkUrl) : p.artworkUrl) : undefined;
      if (href)
        parts.push(
          `<image href="${esc(href)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" opacity="${p.opacity}"/>`
        );
      break;
    }
  }
  const isSleeve = placement === "sleeve_left" || placement === "sleeve_right";
  const pb = pieceBox(spec, placement);
  const band = (from: number, height: number, fill: string) =>
    `<rect x="0" y="${(pb.y + from * pb.h) * H}" width="${W}" height="${height * pb.h * H}" fill="${fill}"/>`;
  if (spec.trim.sidePanels && (placement === "front" || placement === "back")) {
    // panels down both side seams of the fabric piece, with an accent pinline
    const pw = pb.w * 0.1 * W;
    const lw = pb.w * 0.012 * W;
    const x0 = pb.x * W, x1 = (pb.x + pb.w) * W;
    parts.push(`<rect x="0" y="0" width="${x0 + pw}" height="${H}" fill="${secondary}"/><rect x="${x1 - pw}" y="0" width="${W - x1 + pw}" height="${H}" fill="${secondary}"/>`);
    parts.push(`<rect x="${x0 + pw}" y="0" width="${lw}" height="${H}" fill="${accent}"/><rect x="${x1 - pw - lw}" y="0" width="${lw}" height="${H}" fill="${accent}"/>`);
  }
  // jerseys with a separate shoulder piece get the color there instead
  const hasYokePiece = productByKey(spec.product)?.placements.includes("yoke");
  if (spec.trim.yoke && !hasYokePiece) parts.push(`<rect x="0" y="0" width="${W}" height="${(pb.y + 0.14 * pb.h) * H}" fill="${secondary}"/>`);
  if (spec.trim.hemStripes && (placement === "front" || placement === "back")) {
    parts.push(band(0.8, 0.04, secondary), band(0.85, 0.022, accent), band(0.882, 0.04, secondary));
  }
  if (spec.trim.sleeveStripes && isSleeve) {
    const at = isLongSleeve(spec, placement) ? 0.66 : 0.72;
    parts.push(band(at, 0.06, secondary), band(at + 0.08, 0.035, accent));
  }
  if (p.texture && p.texture !== "none") parts.push(texture(p.texture, W, H, primary, `${idp}${placement}`));
  return parts.join("");
}

// The logo's box on this panel, scaled by the customer's size choice and kept
// inside the panel. Older saved designs have no position/scale, hence the defaults.
function logoBox(spec: DesignSpec, placement: Placement): LayoutBox | undefined {
  const pos = !spec.logo.position || spec.logo.position === "auto" ? DEFAULT_LOGO_POSITION[spec.sport] : spec.logo.position;
  const spot = LOGO_SPOTS[pos];
  const base = productByKey(spec.product)?.logoSpots?.[pos]?.[placement] ?? spot[placement];
  if (!base) return undefined;
  const k = spec.logo.scale ?? 1;
  const h = Math.min(base.h * k, 0.9);
  const w = base.w ? Math.min(base.w * k, 0.95) : undefined;
  const half = (w ?? h) / 2;
  // spots above the team name grow downward from their top edge, which sits
  // below this jersey's neckline
  const top = Math.max(base.y - base.h / 2, (pieceFor(spec.product, placement).neck ?? 0) + 0.02);
  const y = (spot.anchorTop ? top + h / 2 : base.y) + (spec.logo.offsetY ?? 0);
  const x = base.x + (spec.logo.offsetX ?? 0);
  return { x: Math.min(Math.max(x, half), 1 - half), y: Math.min(Math.max(y, h / 2), 1 - h / 2), h, w };
}

// Where the logo's center sits on a panel without the customer's offset, in
// piece fractions. The builder uses it to turn a drag into an offset.
export function logoAnchor(spec: DesignSpec, placement: Placement) {
  const b = logoBox({ ...spec, logo: { ...spec.logo, offsetX: 0, offsetY: 0 } }, placement);
  return b ? { x: b.x, y: b.y } : undefined;
}

// The logo's box on a panel in print-file fractions, for the builder's drag handle.
export function logoRect(spec: DesignSpec, placement: Placement): LayoutBox | undefined {
  const b = logoBox(spec, placement);
  return b ? inPiece(b, pieceBox(spec, placement)) : undefined;
}

// Name and number boxes with the customer's size and height adjustments.
function sized(b: LayoutBox | undefined, scale = 1, dy = 0): LayoutBox | undefined {
  if (!b) return b;
  const h = b.h * scale;
  return { x: b.x, y: Math.min(Math.max(b.y + dy, h / 2), 1 - h / 2), h, w: b.w !== undefined ? Math.min(b.w * scale, 0.98) : undefined };
}

// Panel content without the outer <svg>, so previews can nest several panels.
export function renderPanelInner(spec: DesignSpec, placement: Placement, o: RenderOptions): string {
  const { width: W, height: H } = o;
  const std = STANDARDS[spec.sport];
  const raw = productByKey(spec.product)?.layout?.[placement] ?? std.layout[placement] ?? {};
  const pb = pieceBox(spec, placement);
  const Lt = spec.lettering;
  const isBody = placement === "front" || placement === "back";
  const place = (b?: LayoutBox) => (b ? inPiece(b, pb) : undefined);
  const layout = {
    wordmark: place(raw.wordmark),
    logo: place(logoBox(spec, placement)),
    number: place(sized(raw.number, Lt.numberScale ?? 1, isBody ? Lt.numberOffsetY ?? 0 : 0)),
    name: place(sized(raw.name, Lt.nameScale ?? 1, Lt.nameOffsetY ?? 0)),
  };
  const L = spec.lettering;
  const isSleeve = placement === "sleeve_left" || placement === "sleeve_right";
  const els: string[] = [background(spec, placement, W, H, o.resolveImage, o.idPrefix ?? "")];

  // logo
  if (layout.logo && spec.logo.url) {
    const href = o.resolveImage ? o.resolveImage(spec.logo.url) : spec.logo.url;
    if (href) {
      const h = layout.logo.h * H;
      const w = layout.logo.w ? layout.logo.w * W : h;
      const fid = `${o.idPrefix ?? ""}lf-${placement}`;
      const effect = spec.logo.effect ?? "none";
      let filter = "";
      if (effect === "outline") {
        // sticker-style border in a color that pops off the body. A thresholded
        // blur grows the silhouette; feMorphology looks the same but is far too
        // slow at print resolution.
        const { text, primary } = spec.colors;
        const ring = contrast(text, primary) >= 3 ? text : contrast("#FFFFFF", primary) > contrast("#000000", primary) ? "#FFFFFF" : "#000000";
        const r = h * 0.03;
        els.push(
          `<defs><filter id="${fid}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceAlpha" stdDeviation="${(r / 1.3).toFixed(1)}" result="bl"/><feComponentTransfer in="bl" result="d"><feFuncA type="linear" slope="12" intercept="0"/></feComponentTransfer><feFlood flood-color="${ring}"/><feComposite in2="d" operator="in" result="o"/><feGaussianBlur in="d" stdDeviation="${(r * 0.8).toFixed(1)}" result="b"/><feOffset in="b" dy="${(r * 0.6).toFixed(1)}" result="s"/><feFlood flood-color="#000" flood-opacity="0.35"/><feComposite in2="s" operator="in" result="sh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`
        );
        filter = ` filter="url(#${fid})"`;
      } else if (effect === "shadow") {
        const r = h * 0.025;
        els.push(
          `<defs><filter id="${fid}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur in="SourceAlpha" stdDeviation="${r.toFixed(1)}" result="b"/><feOffset in="b" dy="${(r * 0.8).toFixed(1)}" result="s"/><feFlood flood-color="#000" flood-opacity="0.45"/><feComposite in2="s" operator="in" result="sh"/><feMerge><feMergeNode in="sh"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`
        );
        filter = ` filter="url(#${fid})"`;
      }
      els.push(
        `<image href="${esc(href)}" x="${layout.logo.x * W - w / 2}" y="${layout.logo.y * H - h / 2}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"${filter}/>`
      );
    }
  }

  // team wordmark
  if (layout.wordmark && spec.wordmark.show && spec.wordmark.text) {
    els.push(
      textEl({
        id: `${o.idPrefix ?? ""}wm-${placement}`,
        text: spec.wordmark.text,
        font: spec.wordmark.font,
        box: layout.wordmark,
        W, H,
        fill: spec.colors.text,
        stroke: spec.colors.outline,
        outline: L.outlineWidth,
        arch: spec.wordmark.style === "arch",
        effect: L.effect,
        inner: innerRing(spec),
      })
    );
  }

  // player name
  if (layout.name && L.showName && o.player.name) {
    els.push(
      textEl({
        id: `${o.idPrefix ?? ""}nm-${placement}`,
        text: o.player.name,
        font: L.nameFont,
        box: layout.name,
        W, H,
        fill: spec.colors.text,
        stroke: spec.colors.outline,
        outline: L.outlineWidth,
        arch: spec.sport === "baseball",
        effect: L.effect === "double-shadow" ? "double" : L.effect,
        inner: innerRing(spec),
      })
    );
  }

  // player number
  const showNumber =
    (placement === "front" && L.numberFront) || (placement === "back" && L.numberBack) || (isSleeve && L.numberSleeves);
  if (layout.number && showNumber && o.player.number) {
    els.push(
      textEl({
        id: `${o.idPrefix ?? ""}no-${placement}`,
        text: o.player.number,
        font: L.numberFont,
        box: layout.number,
        W, H,
        fill: spec.colors.text,
        stroke: spec.colors.outline,
        outline: L.outlineWidth,
        effect: L.effect,
        inner: innerRing(spec),
      })
    );
  }

  if (o.guides) {
    els.push(
      `<rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="none" stroke="#000" stroke-opacity="0.15" stroke-width="${Math.max(1, W / 300)}"/>`
    );
  }

  return els.join("");
}

export function renderPanelSVG(spec: DesignSpec, placement: Placement, o: RenderOptions): string {
  const { width: W, height: H } = o;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${renderPanelInner(spec, placement, o)}</svg>`;
}

export function placementsFor(spec: DesignSpec): Placement[] {
  return productByKey(spec.product)?.placements ?? ["front", "back"];
}
