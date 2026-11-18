// Jersey graphics: the vector building blocks real jerseys are made of.
//
// Instead of a painted picture, a design is a short list of parts the AI (or
// the customer, on the canvas) configures: body panels split by a shaped edge
// (chevrons, diagonals, star points) with outlined trim, stripe sets at the
// hem, chest or sleeves, a shoulder yoke, a sash, side panels. Each part is a
// shape with its own colors, so it stays sharp at print size, can be selected
// and moved in the builder, and recolors with the team's colors.
//
// Coordinates are fractions of the fabric piece (see garments.ts). Body parts
// use the FRONT piece as their unit on both the front and the back, measured
// so heights meet at the side seams (the back is cut longer in the middle),
// and the back is mirrored so diagonals continue around the body.

import { z } from "zod";
import type { Placement } from "./catalog";
import type { DesignSpec } from "./design-spec";
import { pieceFor } from "./garments";

// A color is one of the design's five color roles (so team kits and brand
// changes recolor it) or a hex value.
export const COLOR_ROLES = ["primary", "secondary", "accent", "text", "outline"] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];
export const ColorRef = z.string().regex(/^(primary|secondary|accent|text|outline|#[0-9a-fA-F]{6})$/);
export type ColorRef = z.infer<typeof ColorRef>;

// Outlined edging along a shape, listed from the shape outward.
const TrimSchema = z
  .array(z.object({ color: ColorRef, width: z.number().min(0.003).max(0.08) }))
  .max(4)
  .default([]);
export type Trim = z.infer<typeof TrimSchema>;

export const PANEL_EDGES = ["straight", "chevron", "diagonal", "double_chevron", "star_point", "wave", "zigzag", "custom"] as const;
export type PanelEdge = (typeof PANEL_EDGES)[number];

const id = z.string().min(1).max(24);

export const PanelSchema = z.object({
  id,
  kind: z.literal("panel"),
  hidden: z.boolean().default(false),
  // the shape of the dividing line
  edge: z.enum(PANEL_EDGES).default("straight"),
  // which side of the line is filled
  side: z.enum(["below", "above"]).default("below"),
  // height of the line at the center of the body (0 top .. 1 hem)
  y: z.number().min(-0.1).max(1.1),
  // chevron/star/double/wave/zigzag amplitude, diagonal tilt. Positive: the
  // center sits higher than the sides (a ^ point); negative: a V.
  depth: z.number().min(-0.6).max(0.6).default(0),
  // custom edge: [x, y] points from the left side to the right side
  points: z.array(z.tuple([z.number().min(-0.1).max(1.1), z.number().min(-0.1).max(1.1)])).max(16).default([]),
  color: ColorRef,
  trim: TrimSchema,
  front: z.boolean().default(true),
  // the back: the same shape (mirrored), a straight line at the side height, or nothing
  back: z.enum(["same", "straight", "none"]).default("same"),
  // continue onto both sleeves as a straight band from sleeveY down
  sleeves: z.boolean().default(false),
  sleeveY: z.number().min(0).max(1).default(0.62),
});

export const StripesSchema = z.object({
  id,
  kind: z.literal("stripes"),
  hidden: z.boolean().default(false),
  // body: around the torso (front and back, meeting at the seams); sleeves: around both arms
  area: z.enum(["body", "sleeves"]).default("body"),
  // top of the stripe set, as a fraction of the piece height
  y: z.number().min(0).max(1),
  // bands from top to bottom: thickness and the gap after it, fractions of the piece height
  bands: z
    .array(z.object({ color: ColorRef, width: z.number().min(0.003).max(0.2), gap: z.number().min(0).max(0.2).default(0.01) }))
    .min(1)
    .max(8),
  front: z.boolean().default(true),
  back: z.boolean().default(true),
});

export const YokeSchema = z.object({
  id,
  kind: z.literal("yoke"),
  hidden: z.boolean().default(false),
  color: ColorRef,
  // how far the yoke comes down the body (jerseys without a separate shoulder piece)
  depth: z.number().min(0.04).max(0.45).default(0.16),
  shape: z.enum(["straight", "curved", "pointed"]).default("straight"),
  trim: TrimSchema,
  // color the top of the sleeves too (shoulder caps)
  sleeves: z.boolean().default(true),
});

export const SashSchema = z.object({
  id,
  kind: z.literal("sash"),
  hidden: z.boolean().default(false),
  // height of the band's center at the left and right edges of the front
  from: z.number().min(-0.2).max(1.2),
  to: z.number().min(-0.2).max(1.2),
  width: z.number().min(0.02).max(0.4).default(0.12),
  color: ColorRef,
  trim: TrimSchema,
  back: z.boolean().default(false),
});

export const SidePanelsSchema = z.object({
  id,
  kind: z.literal("side_panels"),
  hidden: z.boolean().default(false),
  width: z.number().min(0.02).max(0.35).default(0.12),
  // where the panels start from the top (they run to the hem)
  top: z.number().min(0).max(0.9).default(0.2),
  // 0 straight; 1 the top comes to a point
  taper: z.number().min(0).max(1).default(0),
  color: ColorRef,
  trim: TrimSchema,
  back: z.boolean().default(true),
});

export const GraphicSchema = z.discriminatedUnion("kind", [PanelSchema, StripesSchema, YokeSchema, SashSchema, SidePanelsSchema]);
export type Graphic = z.infer<typeof GraphicSchema>;
export type GraphicKind = Graphic["kind"];
export const GraphicsSchema = z.array(GraphicSchema).max(14);

export const GRAPHIC_LABELS: Record<GraphicKind, string> = {
  panel: "Panel",
  stripes: "Stripes",
  yoke: "Yoke",
  sash: "Sash",
  side_panels: "Side panels",
};

// ---- colors ---------------------------------------------------------------

export function resolveColor(spec: Pick<DesignSpec, "colors">, c: string): string {
  return (COLOR_ROLES as readonly string[]).includes(c) ? spec.colors[c as ColorRole] : c;
}

// Store a picked color as a role when it matches one, so kits recolor it.
export function toColorRef(spec: Pick<DesignSpec, "colors">, hex: string): ColorRef {
  const h = hex.toUpperCase();
  const role = COLOR_ROLES.find((r) => spec.colors[r].toUpperCase() === h);
  return role ?? h;
}

// ---- legacy trim ------------------------------------------------------------

// Older designs used three on/off trim switches. They become graphics with the
// exact same geometry, so nothing moves on a saved design.
export function legacyGraphics(spec: DesignSpec): Graphic[] {
  const t = spec.trim;
  const out: Graphic[] = [];
  if (!t) return out;
  if (t.yoke) out.push({ id: "yoke", kind: "yoke", hidden: false, color: "secondary", depth: 0.14, shape: "straight", trim: [], sleeves: true });
  if (t.hemStripes)
    out.push({
      id: "hem",
      kind: "stripes",
      hidden: false,
      area: "body",
      y: 0.8 + (t.hemStripesOffsetY ?? 0),
      bands: [
        { color: "secondary", width: 0.04, gap: 0.01 },
        { color: "accent", width: 0.022, gap: 0.01 },
        { color: "secondary", width: 0.04, gap: 0 },
      ],
      front: true,
      back: true,
    });
  if (t.sleeveStripes) {
    const long = isLongSleevePiece(spec.product, "sleeve_left");
    out.push({
      id: "sleeve",
      kind: "stripes",
      hidden: false,
      area: "sleeves",
      y: (long ? 0.66 : 0.72) + (t.sleeveStripesOffsetY ?? 0),
      bands: [
        { color: "secondary", width: 0.06, gap: 0.02 },
        { color: "accent", width: 0.035, gap: 0 },
      ],
      front: true,
      back: true,
    });
  }
  return out;
}

// Move legacy trim into spec.graphics (and switch the old flags off).
export function materialize(spec: DesignSpec): DesignSpec {
  const legacy = legacyGraphics(spec);
  if (!legacy.length) return spec;
  const taken = new Set((spec.graphics ?? []).map((g) => g.id));
  const fresh = legacy.filter((g) => !taken.has(g.id));
  // the yoke goes underneath everything else
  const yoke = fresh.filter((g) => g.kind === "yoke");
  const rest = fresh.filter((g) => g.kind !== "yoke");
  return {
    ...spec,
    graphics: [...yoke, ...(spec.graphics ?? []), ...rest],
    trim: { ...spec.trim, yoke: false, hemStripes: false, sleeveStripes: false, hemStripesOffsetY: 0, sleeveStripesOffsetY: 0 },
  };
}

export function allGraphics(spec: DesignSpec): Graphic[] {
  const legacy = legacyGraphics(spec);
  const own = spec.graphics ?? [];
  return [...legacy.filter((g) => g.kind === "yoke"), ...own, ...legacy.filter((g) => g.kind !== "yoke")];
}

export function newGraphicId(spec: DesignSpec, kind: GraphicKind) {
  const taken = new Set(allGraphics(spec).map((g) => g.id));
  for (let i = 1; ; i++) {
    const id = `${kind.replace("_", "")}${i}`;
    if (!taken.has(id)) return id;
  }
}

// ---- geometry ---------------------------------------------------------------

export function isLongSleevePiece(product: string, placement: Placement) {
  const p = pieceFor(product, placement);
  return p.box[3] * p.dims.height > 0.75 * p.box[2] * p.dims.width;
}

export type Pt = { x: number; y: number };

// How piece coordinates map to print-file pixels for one panel.
export type Frame = {
  W: number;
  H: number;
  x0: number; // piece left, px
  w: number; // piece width, px
  top: number; // y = 0, px
  unit: number; // px per 1.0 of y (and of trim/band widths)
  mirror: boolean;
};

export const isBody = (pl: Placement) => pl === "front" || pl === "back";
export const isSleeve = (pl: Placement) => pl === "sleeve_left" || pl === "sleeve_right";

export function frameFor(product: string, placement: Placement, W: number, H: number): Frame {
  const piece = pieceFor(product, placement);
  const [bx, by, bw, bh] = piece.box;
  if (isBody(placement)) {
    // both body panels use the front's height unit, lined up at the side seam
    const front = pieceFor(product, "front");
    const [, fy, , fh] = front.box;
    const seamEnd = (p: typeof piece) => p.hem ?? p.box[1] + p.box[3];
    const shift = placement === "back" ? seamEnd(piece) - seamEnd(front) : 0;
    return { W, H, x0: bx * W, w: bw * W, top: (fy + shift) * H, unit: fh * H, mirror: placement === "back" };
  }
  return { W, H, x0: bx * W, w: bw * W, top: by * H, unit: bh * H, mirror: false };
}

export const toPx = (f: Frame, u: number, v: number): Pt => ({ x: f.x0 + (f.mirror ? 1 - u : u) * f.w, y: f.top + v * f.unit });

// The dividing line of a panel, left to right, in piece coordinates.
export function edgePoints(g: z.infer<typeof PanelSchema>, straightAt?: number): [number, number][] {
  const y = g.y;
  const d = g.depth;
  if (straightAt !== undefined) return [[0, straightAt], [1, straightAt]];
  switch (g.edge) {
    case "chevron":
      return [[0, y + d], [0.5, y], [1, y + d]];
    case "diagonal":
      return [[0, y - d / 2], [1, y + d / 2]];
    case "double_chevron":
      return [[0, y + d], [0.25, y], [0.5, y + d], [0.75, y], [1, y + d]];
    case "star_point":
      // a center point rising between two valleys, sides high (the classic star cut)
      return [[0, y - d * 0.55], [0.24, y + d * 0.45], [0.5, y], [0.76, y + d * 0.45], [1, y - d * 0.55]];
    case "wave": {
      const pts: [number, number][] = [];
      for (let i = 0; i <= 24; i++) {
        const u = i / 24;
        pts.push([u, y - d * Math.cos(u * Math.PI * 4) * 0.5]);
      }
      return pts;
    }
    case "zigzag": {
      const pts: [number, number][] = [];
      const n = 6;
      for (let i = 0; i <= n; i++) pts.push([i / n, y + (i % 2 ? d / 2 : -d / 2)]);
      return pts;
    }
    case "custom":
      if (g.points.length >= 2) return [...g.points].sort((a, b) => a[0] - b[0]);
      return [[0, y], [1, y]];
    default:
      return [[0, y], [1, y]];
  }
}

// The height of a panel's edge at the side seams (used for a straight back).
function sideHeight(g: z.infer<typeof PanelSchema>) {
  const pts = edgePoints(g);
  return (pts[0][1] + pts[pts.length - 1][1]) / 2;
}

// Offset a left-to-right polyline by d px; positive d moves it up.
function offsetLine(pts: Pt[], d: number): Pt[] {
  if (!d) return pts;
  const n = pts.length;
  const normals: Pt[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    const dy = pts[i + 1].y - pts[i].y;
    const len = Math.hypot(dx, dy) || 1;
    normals.push({ x: dy / len, y: -dx / len }); // points up for a rightward segment
  }
  return pts.map((p, i) => {
    const a = normals[Math.max(0, i - 1)];
    const b = normals[Math.min(n - 2, i)];
    let nx = a.x + b.x;
    let ny = a.y + b.y;
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const cos = Math.max(0.35, nx * a.x + ny * a.y);
    const m = d / cos;
    return { x: p.x + nx * m, y: p.y + ny * m };
  });
}

// Extend a line flat past both edges of the print file so fills cover it.
function extend(pts: Pt[], W: number): Pt[] {
  const a = pts[0];
  const b = pts[pts.length - 1];
  return [{ x: Math.min(-20, a.x - 20), y: a.y }, ...pts, { x: Math.max(W + 20, b.x + 20), y: b.y }];
}

const polyD = (pts: Pt[]) => `M${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("L")}Z`;

// A filled region on one side of a line (px), as a path.
function region(line: Pt[], side: "below" | "above", f: Frame) {
  const ext = extend(line, f.W);
  const far = side === "below" ? f.H + 20 : -20;
  return polyD([...ext, { x: ext[ext.length - 1].x, y: far }, { x: ext[0].x, y: far }]);
}

// A shape drawn as filled layers: trim from the outside in, then the shape.
type Layer = { d: string; fill: string };

export type GraphicGeometry = {
  layers: Layer[];
  // outline for selection and hit testing (px)
  hit: Pt[][];
  // the line a selected panel is dragged by (px), optional
  guide?: Pt[];
};

// avoid: the band (px) of the back name and number, which a straight back
// split steps down around so the number stays on a clean field.
export type Avoid = { y0: number; y1: number } | undefined;

export function graphicGeometry(spec: DesignSpec, g: Graphic, placement: Placement, W: number, H: number, avoid?: Avoid): GraphicGeometry | null {
  if (g.hidden) return null;
  const col = (c: string) => resolveColor(spec, c);
  const f = frameFor(spec.product, placement, W, H);
  const body = isBody(placement);
  const sleeve = isSleeve(placement);
  const yokePiece = spec.product in YOKE_PRODUCTS;

  switch (g.kind) {
    case "panel": {
      let line: [number, number][] | null = null;
      if (placement === "front" && g.front) line = edgePoints(g);
      else if (placement === "back" && g.back !== "none") line = g.back === "same" ? edgePoints(g) : edgePoints(g, sideHeight(g));
      else if (sleeve && g.sleeves) line = [[0, g.sleeveY], [1, g.sleeveY]];
      if (!line) return null;
      let px = line.map(([u, v]) => toPx(f, u, v)).sort((a, b) => a.x - b.x);
      if (placement === "back" && g.back === "straight" && avoid && g.side === "below") {
        // a straight back split that would cut through the number steps down
        // below it, still meeting the front at the side seams
        const yAt = px[0].y;
        const margin = 0.03 * f.unit;
        if (yAt > avoid.y0 - margin && yAt < avoid.y1 + margin) {
          const low = avoid.y1 + margin;
          px = [px[0], { x: f.x0 + 0.17 * f.w, y: low }, { x: f.x0 + 0.83 * f.w, y: low }, px[px.length - 1]];
        }
      }
      const up = g.side === "below" ? 1 : -1;
      const layers: Layer[] = [];
      let acc = g.trim.reduce((s, t) => s + t.width, 0);
      for (let i = g.trim.length - 1; i >= 0; i--) {
        layers.push({ d: region(offsetLine(px, up * acc * f.unit), g.side, f), fill: col(g.trim[i].color) });
        acc -= g.trim[i].width;
      }
      layers.push({ d: region(px, g.side, f), fill: col(g.color) });
      const outer = offsetLine(px, up * g.trim.reduce((s, t) => s + t.width, 0) * f.unit);
      const ext = extend(outer, f.W);
      const far = g.side === "below" ? f.H : 0;
      return { layers, hit: [[...ext, { x: ext[ext.length - 1].x, y: far }, { x: ext[0].x, y: far }]], guide: px };
    }
    case "stripes": {
      if (g.area === "body" ? !body || (placement === "front" ? !g.front : !g.back) : !sleeve) return null;
      const layers: Layer[] = [];
      let v = g.y;
      for (const b of g.bands) {
        const y0 = f.top + v * f.unit;
        layers.push({ d: `M-20 ${y0.toFixed(1)}H${W + 20}V${(y0 + b.width * f.unit).toFixed(1)}H-20Z`, fill: col(b.color) });
        v += b.width + b.gap;
      }
      const lastGap = g.bands[g.bands.length - 1].gap;
      const y0 = f.top + g.y * f.unit;
      const y1 = f.top + (v - lastGap) * f.unit;
      return { layers, hit: [[{ x: f.x0, y: y0 }, { x: f.x0 + f.w, y: y0 }, { x: f.x0 + f.w, y: y1 }, { x: f.x0, y: y1 }]] };
    }
    case "yoke": {
      if (placement === "yoke") return { layers: [{ d: `M0 0H${W}V${H}H0Z`, fill: col(g.color) }], hit: [[{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }]] };
      if (sleeve) {
        // the shoulder piece covers the top of raglan sleeves on yoke jerseys
        if (!g.sleeves || yokePiece) return null;
        const cap = g.depth;
        const y1 = f.top + cap * f.unit;
        const layers: Layer[] = [];
        let acc = g.trim.reduce((s, t) => s + t.width, 0);
        for (let i = g.trim.length - 1; i >= 0; i--) {
          layers.push({ d: `M-20 -20H${W + 20}V${(y1 + acc * f.unit).toFixed(1)}H-20Z`, fill: col(g.trim[i].color) });
          acc -= g.trim[i].width;
        }
        layers.push({ d: `M-20 -20H${W + 20}V${y1.toFixed(1)}H-20Z`, fill: col(g.color) });
        return { layers, hit: [[{ x: f.x0, y: f.top }, { x: f.x0 + f.w, y: f.top }, { x: f.x0 + f.w, y: y1 }, { x: f.x0, y: y1 }]] };
      }
      if (!body) return null;
      if (yokePiece) {
        // piping along the seam under the separate shoulder piece
        if (!g.trim.length) return null;
        const pb = pieceFor(spec.product, placement).box;
        const top = pb[1] * H;
        const layers: Layer[] = [];
        let acc = g.trim.reduce((s, t) => s + t.width, 0);
        for (let i = g.trim.length - 1; i >= 0; i--) {
          layers.push({ d: `M-20 ${(top - 0.02 * f.unit).toFixed(1)}H${W + 20}V${(top + acc * f.unit).toFixed(1)}H-20Z`, fill: col(g.trim[i].color) });
          acc -= g.trim[i].width;
        }
        const tw = g.trim.reduce((s, t) => s + t.width, 0) * f.unit;
        return { layers, hit: [[{ x: f.x0, y: top }, { x: f.x0 + f.w, y: top }, { x: f.x0 + f.w, y: top + tw }, { x: f.x0, y: top + tw }]] };
      }
      // front and back meet at the shoulder seam, so a yoke is measured from
      // each panel's own top edge
      const pb = pieceFor(spec.product, placement).box;
      const yf: Frame = { ...f, top: pb[1] * H, unit: pb[3] * H };
      const d = g.depth;
      const pts: [number, number][] =
        g.shape === "pointed"
          ? [[0, d * 0.75], [0.5, d * 1.3], [1, d * 0.75]]
          : g.shape === "curved"
            ? Array.from({ length: 13 }, (_, i) => {
                const u = i / 12;
                return [u, d * (0.7 + 0.3 * Math.sin(u * Math.PI))] as [number, number];
              })
            : [[0, d], [1, d]];
      const px = pts.map(([u, v]) => toPx(yf, u, v)).sort((a, b) => a.x - b.x);
      const layers: Layer[] = [];
      let acc = g.trim.reduce((s, t) => s + t.width, 0);
      for (let i = g.trim.length - 1; i >= 0; i--) {
        layers.push({ d: region(offsetLine(px, -acc * f.unit), "above", f), fill: col(g.trim[i].color) });
        acc -= g.trim[i].width;
      }
      layers.push({ d: region(px, "above", f), fill: col(g.color) });
      const ext = extend(px, f.W);
      return { layers, hit: [[...ext, { x: ext[ext.length - 1].x, y: 0 }, { x: ext[0].x, y: 0 }]], guide: px };
    }
    case "sash": {
      if (!(placement === "front" || (placement === "back" && g.back))) return null;
      const band = (half: number) => {
        const a = toPx(f, -0.1, g.from - (g.to - g.from) * 0.1);
        const b = toPx(f, 1.1, g.to + (g.to - g.from) * 0.1);
        const [l, r] = a.x < b.x ? [a, b] : [b, a];
        const h = half * f.unit;
        return [{ x: l.x, y: l.y - h }, { x: r.x, y: r.y - h }, { x: r.x, y: r.y + h }, { x: l.x, y: l.y + h }];
      };
      const layers: Layer[] = [];
      let acc = g.trim.reduce((s, t) => s + t.width, 0);
      for (let i = g.trim.length - 1; i >= 0; i--) {
        layers.push({ d: polyD(band(g.width / 2 + acc)), fill: col(g.trim[i].color) });
        acc -= g.trim[i].width;
      }
      layers.push({ d: polyD(band(g.width / 2)), fill: col(g.color) });
      return { layers, hit: [band(g.width / 2 + g.trim.reduce((s, t) => s + t.width, 0))] };
    }
    case "side_panels": {
      if (!(placement === "front" || (placement === "back" && g.back))) return null;
      // width is a fraction of the piece width; trims are measured like heights
      const shape = (extra: number) => {
        const ww = g.width * f.w + extra;
        const topY = f.top + g.top * f.unit;
        const tw = ww * (1 - g.taper);
        const left = [{ x: -20, y: topY }, { x: f.x0 + tw, y: topY }, { x: f.x0 + ww, y: topY + 0.25 * f.unit * g.taper }, { x: f.x0 + ww, y: H + 20 }, { x: -20, y: H + 20 }];
        const right = left.map((p) => ({ x: 2 * (f.x0 + f.w / 2) - p.x, y: p.y }));
        return [left, right];
      };
      const layers: Layer[] = [];
      let acc = g.trim.reduce((s, t) => s + t.width, 0);
      for (let i = g.trim.length - 1; i >= 0; i--) {
        for (const s of shape(acc * f.unit)) layers.push({ d: polyD(s), fill: col(g.trim[i].color) });
        acc -= g.trim[i].width;
      }
      for (const s of shape(0)) layers.push({ d: polyD(s), fill: col(g.color) });
      return { layers, hit: shape(g.trim.reduce((s, t) => s + t.width, 0) * f.unit) };
    }
  }
}

// Products sewn with a separate shoulder piece.
const YOKE_PRODUCTS: Record<string, true> = { "hockey-recycled": true, "football-american": true };
export const hasYokePiece = (product: string) => product in YOKE_PRODUCTS;

export function renderGraphics(spec: DesignSpec, placement: Placement, W: number, H: number, avoid?: Avoid): string {
  return allGraphics(spec)
    .map((g) => graphicGeometry(spec, g, placement, W, H, avoid))
    .filter((x): x is GraphicGeometry => !!x)
    .flatMap((x) => x.layers.map((l) => `<path d="${l.d}" fill="${l.fill}"/>`))
    .join("");
}

export function pointInPoly(p: Pt, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
