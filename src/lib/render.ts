// Renders one print panel (front, back, sleeve) of a jersey as SVG.
//
// This single function drives both the in-browser preview and the server-side
// print files sent to Printful, so the printed jersey matches the preview.
// The artwork, colors and fonts come from the saved DesignSpec; only the
// player's name and number vary between team members.

import { STANDARDS, productByKey, type LayoutBox, type Placement } from "./catalog";
import { FONTS, type DesignSpec, type Player } from "./design-spec";

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
  // preview only: nudge/scale layout boxes to fit a slanted sleeve silhouette
  fit?: { dx: number; scale: number };
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// rough average glyph width/height ratio per font, used to keep text inside its box
const WIDTH_RATIO: Record<string, number> = {
  graduate: 0.78, bebas: 0.42, oswald: 0.5, anton: 0.48, teko: 0.42, yellowtail: 0.55, blackops: 0.75,
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
  } fill="${fill}" stroke="${stroke}" stroke-width="${sw.toFixed(1)}" stroke-linejoin="round" paint-order="stroke" text-anchor="middle"`;
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
  if (spec.trim.yoke) parts.push(`<rect x="0" y="0" width="${W}" height="${H * 0.14}" fill="${secondary}"/>`);
  if (spec.trim.hemStripes && !isSleeve) {
    parts.push(`<rect x="0" y="${H * 0.8}" width="${W}" height="${H * 0.035}" fill="${secondary}"/>`);
    parts.push(`<rect x="0" y="${H * 0.845}" width="${W}" height="${H * 0.02}" fill="${accent}"/>`);
    parts.push(`<rect x="0" y="${H * 0.875}" width="${W}" height="${H * 0.035}" fill="${secondary}"/>`);
  }
  if (spec.trim.sleeveStripes && isSleeve) {
    parts.push(`<rect x="0" y="${H * 0.66}" width="${W}" height="${H * 0.05}" fill="${secondary}"/>`);
    parts.push(`<rect x="0" y="${H * 0.73}" width="${W}" height="${H * 0.03}" fill="${accent}"/>`);
  }
  return parts.join("");
}

// Panel content without the outer <svg>, so previews can nest several panels.
export function renderPanelInner(spec: DesignSpec, placement: Placement, o: RenderOptions): string {
  const { width: W, height: H } = o;
  const std = STANDARDS[spec.sport];
  const raw = std.layout[placement] ?? {};
  const fit = o.fit;
  const adj = (b?: LayoutBox): LayoutBox | undefined =>
    b && fit ? { x: b.x + fit.dx, y: b.y, h: b.h * fit.scale, w: b.w ? b.w * fit.scale : undefined } : b;
  const layout = { wordmark: adj(raw.wordmark), logo: adj(raw.logo), number: adj(raw.number), name: adj(raw.name) };
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
