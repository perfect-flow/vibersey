// Renders one print panel (front, back, sleeve) of a jersey as SVG.
//
// This single function drives both the in-browser preview and the server-side
// print files sent to Printful, so the printed jersey matches the preview.
// The artwork, colors and fonts come from the saved DesignSpec; only the
// player's name and number vary between team members.

import { STANDARDS, LOGO_SPOTS, DEFAULT_LOGO_POSITION, PATCH_SPOTS, PATCH_SPOT_OVERRIDES, YOKE_PATCH_SPOTS, DEFAULT_PATCH_POSITION, productByKey, type LayoutBox, type Placement, type PatchKind, type PatchPosition } from "./catalog";
import { FONTS, type DesignSpec, type Player } from "./design-spec";
import { pieceFor } from "./garments";
import { allGraphics, graphicGeometry, renderGraphics } from "./graphics";

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
  diagonal?: boolean;
}) {
  const { id, text, font, box, W, H, fill, stroke, outline, arch, diagonal } = opts;
  if (!text) return "";
  const f = FONTS[font];
  const size = fitFontSize(text, font, box, W, H);
  const cx = box.x * W;
  const baseline = box.y * H + (size * CAP_RATIO) / 2;
  const sw = size * outline * 2;
  const common = `font-family="${f.family}" font-size="${size.toFixed(1)}"${
    "weight" in f ? ` font-weight="${f.weight}"` : ""
  }${"italic" in f ? ` font-style="italic"` : ""} fill="${fill}" stroke="${stroke}" stroke-width="${sw.toFixed(1)}" stroke-linejoin="round" paint-order="stroke" text-anchor="middle"`;
  if (diagonal) {
    // a rising slant across the chest, like a classic script wordmark
    return `<text x="${cx.toFixed(1)}" y="${baseline.toFixed(1)}" transform="rotate(-9 ${cx.toFixed(1)} ${(box.y * H).toFixed(1)})" ${common}>${esc(text)}</text>`;
  }
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
  const { primary, secondary } = spec.colors;
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
  // yoke, panels, stripes, sash, side panels (graphics.ts)
  parts.push(renderGraphics(spec, placement, W, H, backNumberBand(spec, placement, H)));
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

// Where a patch (alternate logo or captain letter) sits on a panel, in piece
// fractions. Empty when it isn't on this panel. Shoulder spots use the
// separate shoulder piece when the jersey has one.
function patchPosition(spec: DesignSpec, kind: PatchKind): Exclude<PatchPosition, "auto"> {
  const p = spec.patches?.[kind];
  return !p?.position || p.position === "auto" ? DEFAULT_PATCH_POSITION[spec.sport][kind] : p.position;
}
const hasYoke = (spec: DesignSpec) => !!productByKey(spec.product)?.placements.includes("yoke");

export function patchBoxes(spec: DesignSpec, kind: PatchKind, placement: Placement): LayoutBox[] {
  const p = spec.patches?.[kind];
  if (!p) return [];
  const pos = patchPosition(spec, kind);
  const yokeBoxes = hasYoke(spec) ? YOKE_PATCH_SPOTS[pos] : undefined;
  const isSleeve = placement === "sleeve_left" || placement === "sleeve_right";
  let bases: LayoutBox[];
  if (yokeBoxes) bases = placement === "yoke" ? yokeBoxes : [];
  else {
    const spot = PATCH_SPOTS[pos];
    const sized = isSleeve ? (isLongSleeve(spec, placement) ? spot.long : spot.short) : undefined;
    const b = PATCH_SPOT_OVERRIDES[spec.sport]?.[pos]?.[placement] ?? sized?.[placement] ?? spot[placement];
    bases = b ? [b] : [];
  }
  const k = p.scale ?? 1;
  return bases.map((base) => {
    const h = Math.min(base.h * k, 0.5);
    const w = base.w ? Math.min(base.w * k, 0.8) : undefined;
    let y = base.y;
    // keep chest patches below the neckline
    if (placement === "front" && base.y < 0.5) y = Math.max(y, (pieceFor(spec.product, placement).neck ?? 0) + h / 2 + 0.03);
    return { x: base.x, y, h, w };
  });
}

// Is a patch spot available on this jersey? (No shoulders on a tank top.)
export function patchSpotFits(spec: DesignSpec, pos: PatchPosition, kind: PatchKind): boolean {
  const placements = placementsFor(spec);
  const real = pos === "auto" ? DEFAULT_PATCH_POSITION[spec.sport][kind] : pos;
  if (placements.includes("yoke") && YOKE_PATCH_SPOTS[real]) return true;
  const spot = PATCH_SPOTS[real];
  const panels = new Set<string>([...Object.keys(spot.long ?? {}), ...Object.keys(spot.short ?? {}), ...Object.keys(spot).filter((k) => k !== "long" && k !== "short")]);
  return [...panels].some((pl) => placements.includes(pl as Placement));
}

function patchEls(spec: DesignSpec, placement: Placement, pb: PBox, o: RenderOptions): string[] {
  const { width: W, height: H } = o;
  const out: string[] = [];
  const alt = spec.patches?.alternate;
  const altHref = alt?.show && alt.url ? (o.resolveImage ? o.resolveImage(alt.url) : alt.url) : undefined;
  if (altHref) {
    for (const b of patchBoxes(spec, "alternate", placement)) {
      const box = inPiece(b, pb);
      const h = box.h * H;
      const w = box.w ? box.w * W : h;
      out.push(`<image href="${esc(altHref)}" x="${box.x * W - w / 2}" y="${box.y * H - h / 2}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>`);
    }
  }
  const cap = spec.patches?.captain;
  if (!cap || cap.letter === "none") return out;
  const font = spec.lettering.numberFont;
  patchBoxes(spec, "captain", placement).forEach((b, i) => {
    const box = inPiece(b, pb);
    const id = `${o.idPrefix ?? ""}cp-${placement}-${i}`;
    if (cap.style === "patch") {
      // a sewn-on style patch: rounded square in the second color with the letter inside
      const s = Math.min(box.h * H, (box.w ?? box.h) * W);
      out.push(
        `<rect x="${(box.x * W - s / 2).toFixed(1)}" y="${(box.y * H - s / 2).toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" rx="${(s * 0.18).toFixed(1)}" fill="${spec.colors.secondary}" stroke="${spec.colors.outline}" stroke-width="${(s * 0.06).toFixed(1)}"/>`,
        textEl({ id, text: cap.letter, font, box: { x: box.x, y: box.y, h: box.h * 0.55 }, W, H, fill: spec.colors.primary, stroke: spec.colors.primary, outline: 0 })
      );
    } else {
      out.push(textEl({ id, text: cap.letter, font, box: { x: box.x, y: box.y, h: box.h }, W, H, fill: spec.colors.text, stroke: spec.colors.outline, outline: Math.max(0.06, spec.lettering.outlineWidth) }));
    }
  });
  return out;
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
  // stay above any stripes around the hem
  const stripeTops = allGraphics(spec)
    .filter((g) => g.kind === "stripes" && g.area === "body" && !g.hidden && g.y > 0.5)
    .map((g) => (g.kind === "stripes" ? g.y : 1));
  const floor = placement === "front" || placement === "back" ? Math.min(0.94, ...stripeTops.map((y) => y - 0.02)) : 0.94;
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

// Where the team name, logo, number and name sit on a panel, in piece
// fractions, with the customer's size and position adjustments applied.
export function panelLayout(spec: DesignSpec, placement: Placement) {
  const std = STANDARDS[spec.sport];
  const raw = productByKey(spec.product)?.layout?.[placement] ?? std.layout[placement] ?? {};
  const Lt = spec.lettering;
  const body = placement === "front" || placement === "back";
  const logoPiece = spec.logo.url ? logoBox(spec, placement) : undefined;
  const numberPiece = shift(sized(raw.number, Lt.numberScale ?? 1, body ? Lt.numberOffsetY ?? 0 : 0), body ? Lt.numberOffsetX ?? 0 : 0);
  const frontNumber = placement === "front" && Lt.numberFront ? numberPiece : undefined;
  const wm = spec.wordmark;
  const touched = (wm.scale ?? 1) !== 1 || !!wm.offsetX || !!wm.offsetY;
  const wmBase = sized(raw.wordmark, wm.scale ?? 1);
  // the team name steps out of the logo's way until the customer places it themselves
  const wmPlaced = touched ? wmBase : clearOfLogo(spec, placement, wmBase, logoPiece, frontNumber);
  return {
    wordmark: shift(wmPlaced, wm.offsetX ?? 0, wm.offsetY ?? 0),
    logo: logoPiece,
    number: numberPiece,
    name: shift(sized(raw.name, Lt.nameScale ?? 1, Lt.nameOffsetY ?? 0), Lt.nameOffsetX ?? 0),
  };
}

function shift(b: LayoutBox | undefined, dx = 0, dy = 0): LayoutBox | undefined {
  if (!b || (!dx && !dy)) return b;
  const half = (b.w ?? b.h) / 2;
  return { ...b, x: Math.min(Math.max(b.x + dx, Math.min(half, 0.5)), Math.max(1 - half, 0.5)), y: Math.min(Math.max(b.y + dy, b.h / 2), 1 - b.h / 2) };
}

// Panel content without the outer <svg>, so previews can nest several panels.
export function renderPanelInner(spec: DesignSpec, placement: Placement, o: RenderOptions): string {
  const { width: W, height: H } = o;
  const pb = pieceBox(spec, placement);
  const place = (b?: LayoutBox) => (b ? inPiece(b, pb) : undefined);
  const lp = panelLayout(spec, placement);
  const layout = { wordmark: place(lp.wordmark), logo: place(lp.logo), number: place(lp.number), name: place(lp.name) };
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

  // alternate-logo patches and the captain's letter
  els.push(...patchEls(spec, placement, pb, o));

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
        diagonal: spec.wordmark.style === "diagonal",
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

// The back's name-and-number band in print-file pixels (the same for every
// player, so team jerseys all get the same graphics).
function backNumberBand(spec: DesignSpec, placement: Placement, H: number) {
  if (placement !== "back" || (!spec.lettering.numberBack && !spec.lettering.showName)) return undefined;
  const lp = panelLayout(spec, placement);
  const pb = pieceBox(spec, placement);
  const boxes = [spec.lettering.numberBack ? lp.number : undefined, spec.lettering.showName ? lp.name : undefined].filter((b): b is LayoutBox => !!b);
  if (!boxes.length) return undefined;
  const y0 = Math.min(...boxes.map((b) => pb.y + (b.y - b.h * 0.75) * pb.h)) * H;
  const y1 = Math.max(...boxes.map((b) => pb.y + (b.y + b.h * 0.75) * pb.h)) * H;
  return { y0, y1 };
}

// ---- selection (builder canvas) ---------------------------------------------

export type Selectable = {
  id: string; // "logo", "wordmark", "number", "name", "patch:alternate", "patch:captain", "g:<graphic id>"
  // print-file pixels
  rect?: { x: number; y: number; w: number; h: number };
  poly?: { x: number; y: number }[][];
  guide?: { x: number; y: number }[];
};

// Everything the customer can click on a panel, top-most first.
export function selectables(spec: DesignSpec, placement: Placement, player: Player, W: number, H: number): Selectable[] {
  const pb = pieceBox(spec, placement);
  const lp = panelLayout(spec, placement);
  const out: Selectable[] = [];
  const L = spec.lettering;
  const isSl = placement === "sleeve_left" || placement === "sleeve_right";
  const textRect = (b: LayoutBox | undefined, text: string, font: keyof typeof FONTS, pad = 1.15) => {
    if (!b || !text) return undefined;
    const box = inPiece(b, pb);
    const size = fitFontSize(text, font, box, W, H);
    const w = Math.max(text.length * size * (WIDTH_RATIO[font] ?? 0.6) * pad, size * 0.8);
    const h = size * CAP_RATIO * 1.5;
    return { x: box.x * W - w / 2, y: box.y * H - h / 2, w, h };
  };
  if (lp.logo && spec.logo.url) {
    const b = inPiece(lp.logo, pb);
    const h = b.h * H;
    const w = b.w ? b.w * W : h;
    out.push({ id: "logo", rect: { x: b.x * W - w / 2, y: b.y * H - h / 2, w, h } });
  }
  if (spec.wordmark.show && spec.wordmark.text) {
    const r = textRect(lp.wordmark, spec.wordmark.text, spec.wordmark.font, spec.wordmark.style === "arch" ? 1.2 : 1.1);
    if (r) out.push({ id: "wordmark", rect: spec.wordmark.style === "arch" ? { ...r, y: r.y - r.h * 0.25, h: r.h * 1.4 } : r });
  }
  const showNumber = (placement === "front" && L.numberFront) || (placement === "back" && L.numberBack) || (isSl && L.numberSleeves);
  if (showNumber) {
    const r = textRect(lp.number, player.number, L.numberFont);
    if (r) out.push({ id: "number", rect: r });
  }
  if (L.showName) {
    const r = textRect(lp.name, player.name, L.nameFont);
    if (r) out.push({ id: "name", rect: r });
  }
  for (const kind of ["alternate", "captain"] as const) {
    const on = kind === "alternate" ? !!spec.patches?.alternate?.show && !!spec.patches.alternate.url : (spec.patches?.captain?.letter ?? "none") !== "none";
    if (!on) continue;
    for (const b of patchBoxes(spec, kind, placement)) {
      const box = inPiece(b, pb);
      const h = box.h * H;
      const w = box.w ? box.w * W : h;
      out.push({ id: `patch:${kind}`, rect: { x: box.x * W - w / 2, y: box.y * H - h / 2, w, h } });
    }
  }
  const gs = allGraphics(spec);
  for (let i = gs.length - 1; i >= 0; i--) {
    const geo = graphicGeometry(spec, gs[i], placement, W, H, backNumberBand(spec, placement, H));
    if (geo) out.push({ id: `g:${gs[i].id}`, poly: geo.hit, guide: geo.guide });
  }
  return out;
}
