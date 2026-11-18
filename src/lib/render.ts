// Renders one print panel (front, back, sleeve) of a jersey as SVG.
//
// This single function drives both the in-browser preview and the server-side
// print files sent to Printful, so the printed jersey matches the preview.
// The artwork, colors and fonts come from the saved DesignSpec; only the
// player's name and number vary between team members.

import { STANDARDS, LOGO_SPOTS, DEFAULT_LOGO_POSITION, productByKey, type LayoutBox, type Placement } from "./catalog";
import { FONTS, type DesignSpec, type Player } from "./design-spec";
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

// Where the hem stripes start on the front or back, and the unit their
// thickness is measured in, both as fractions of the print-file height.
//
// The front and back are different shapes: the back of a hockey (or baseball)
// jersey has a curved tail and is cut taller than the front. Placing the
// stripes a fixed fraction down each piece put them lower on the back than on
// the front, so they didn't meet at the side seams. Instead both panels use
// the front's stripe height and thickness, measured from the point where the
// side seam meets the hem, which is the same on both pieces.
export function hemStripeFrame(spec: DesignSpec, placement: "front" | "back") {
  const front = pieceFor(spec.product, "front");
  const piece = pieceFor(spec.product, placement);
  const [, fy, , fh] = front.box;
  const seamEnd = (p: typeof piece) => p.hem ?? p.box[1] + p.box[3];
  const shift = seamEnd(piece) - seamEnd(front);
  return { top: fy + (0.8 + (spec.trim.hemStripesOffsetY ?? 0)) * fh + shift, unit: fh };
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
}) {
  const { id, text, font, box, W, H, fill, stroke, outline, arch } = opts;
  if (!text) return "";
  const f = FONTS[font];
  const size = fitFontSize(text, font, box, W, H);
  const cx = box.x * W;
  const baseline = box.y * H + (size * CAP_RATIO) / 2;
  const sw = size * outline * 2;
  const common = `font-family="${f.family}" font-size="${size.toFixed(1)}"${
    "weight" in f ? ` font-weight="${f.weight}"` : ""
  }${"italic" in f ? ` font-style="italic"` : ""} fill="${fill}" stroke="${stroke}" stroke-width="${sw.toFixed(1)}" stroke-linejoin="round" paint-order="stroke" text-anchor="middle"`;
  if (!arch) {
    return `<text x="${cx.toFixed(1)}" y="${baseline.toFixed(1)}" ${common}>${esc(text)}</text>`;
  }
  // gentle upward arch, like a classic varsity chest wordmark
  const half = ((box.w ?? 0.6) * W) / 2;
  const rise = size * 0.55;
  const d = `M ${cx - half} ${baseline + rise} Q ${cx} ${baseline - rise} ${cx + half} ${baseline + rise}`;
  return `<path id="${id}" d="${d}" fill="none"/><text ${common}><textPath href="#${id}" startOffset="50%">${esc(text)}</textPath></text>`;
}

function background(spec: DesignSpec, placement: Placement, W: number, H: number, resolveImage?: RenderOptions["resolveImage"], idp = "") {
  const { primary, secondary, accent } = spec.colors;
  // the shoulder piece: the contrasting yoke color, or the body graphic
  if (placement === "yoke" && spec.trim.yoke) return `<rect width="${W}" height="${H}" fill="${secondary}"/>`;
  const parts: string[] = [`<rect width="${W}" height="${H}" fill="${primary}"/>`];
  const p = spec.pattern;
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
  // jerseys with a separate shoulder piece get the color there instead
  const hasYokePiece = productByKey(spec.product)?.placements.includes("yoke");
  if (spec.trim.yoke && !hasYokePiece) parts.push(`<rect x="0" y="0" width="${W}" height="${(pb.y + 0.14 * pb.h) * H}" fill="${secondary}"/>`);
  if (spec.trim.hemStripes && (placement === "front" || placement === "back")) {
    const { top, unit } = hemStripeFrame(spec, placement);
    const hband = (from: number, height: number, fill: string) =>
      `<rect x="0" y="${(top + from * unit) * H}" width="${W}" height="${height * unit * H}" fill="${fill}"/>`;
    parts.push(hband(0, 0.04, secondary), hband(0.05, 0.022, accent), hband(0.082, 0.04, secondary));
  }
  if (spec.trim.sleeveStripes && isSleeve) {
    const at = (isLongSleeve(spec, placement) ? 0.66 : 0.72) + (spec.trim.sleeveStripesOffsetY ?? 0);
    parts.push(band(at, 0.06, secondary), band(at + 0.08, 0.035, accent));
  }
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

function overlaps(a: LayoutBox, b: LayoutBox) {
  return Math.abs(a.x - b.x) < ((a.w ?? a.h) + (b.w ?? b.h)) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}

// Keep the chest team name from being printed over the logo: when the two
// overlap, the name moves just below the logo, or above it if there's no room
// below (hem stripes). It stays put if the new spot would hit the front
// number. Piece fractions.
function clearOfLogo(spec: DesignSpec, placement: Placement, wm: LayoutBox | undefined, logo: LayoutBox | undefined, avoid?: LayoutBox) {
  if (!wm || !logo || !spec.wordmark.show || !spec.wordmark.text || !overlaps(wm, logo)) return wm;
  const moved = moveClear(spec, placement, wm, logo);
  return avoid && overlaps(moved, avoid) ? wm : moved;
}

function moveClear(spec: DesignSpec, placement: Placement, wm: LayoutBox, logo: LayoutBox): LayoutBox {
  const gap = 0.025;
  const floor = spec.trim.hemStripes && (placement === "front" || placement === "back") ? 0.76 : 0.94;
  const ceil = (pieceFor(spec.product, placement).neck ?? 0) + 0.04;
  const below = logo.y + logo.h / 2 + gap + wm.h / 2;
  if (below + wm.h / 2 <= floor) return { ...wm, y: below };
  const above = logo.y - logo.h / 2 - gap - wm.h / 2;
  if (above - wm.h / 2 >= ceil) return { ...wm, y: above };
  return { ...wm, y: Math.min(below, floor - wm.h / 2) };
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
  const logoPiece = spec.logo.url ? logoBox(spec, placement) : undefined;
  const numberPiece = sized(raw.number, Lt.numberScale ?? 1, isBody ? Lt.numberOffsetY ?? 0 : 0);
  const frontNumber = placement === "front" && Lt.numberFront ? numberPiece : undefined;
  const layout = {
    wordmark: place(clearOfLogo(spec, placement, raw.wordmark, logoPiece, frontNumber)),
    logo: place(logoPiece),
    number: place(numberPiece),
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
      els.push(
        `<image href="${esc(href)}" x="${layout.logo.x * W - w / 2}" y="${layout.logo.y * H - h / 2}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`
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
