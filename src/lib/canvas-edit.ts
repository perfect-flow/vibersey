// Turn a drag on the builder canvas into a design change. Every change is
// computed from the design as it was when the drag started, so a long drag
// never drifts.

import type { Placement } from "./catalog";
import type { DesignSpec } from "./design-spec";
import { pieceFor } from "./garments";
import { frameFor, materialize, type Graphic } from "./graphics";
import type { CanvasTransform } from "@/components/JerseyPreview";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function applyCanvasTransform(start: DesignSpec, id: string, pl: Placement, t: CanvasTransform): DesignSpec {
  const piece = pieceFor(start.product, pl);
  const { width: W, height: H } = piece.dims;
  // piece fractions for text and logos
  const du = t.mode === "move" ? t.dx / (piece.box[2] * W) : 0;
  const dv = t.mode === "move" ? t.dy / (piece.box[3] * H) : 0;
  const k = t.mode === "scale" ? t.factor : 1;
  const s: DesignSpec = structuredClone(start);
  const body = pl === "front" || pl === "back";

  switch (id) {
    case "logo":
      if (t.mode === "move") s.logo = { ...s.logo, offsetX: r3(clamp((s.logo.offsetX ?? 0) + du, -0.5, 0.5)), offsetY: r3(clamp((s.logo.offsetY ?? 0) + dv, -0.5, 0.5)) };
      if (t.mode === "scale") s.logo = { ...s.logo, scale: r3(clamp((s.logo.scale ?? 1) * k, 0.5, 3)) };
      return s;
    case "wordmark":
      if (t.mode === "move") s.wordmark = { ...s.wordmark, offsetX: r3(clamp((s.wordmark.offsetX ?? 0) + du, -0.5, 0.5)), offsetY: r3(clamp((s.wordmark.offsetY ?? 0) + dv, -0.5, 0.5)) };
      if (t.mode === "scale") s.wordmark = { ...s.wordmark, scale: r3(clamp((s.wordmark.scale ?? 1) * k, 0.4, 2.5)) };
      return s;
    case "number":
      if (t.mode === "move" && body)
        s.lettering = { ...s.lettering, numberOffsetX: r3(clamp((s.lettering.numberOffsetX ?? 0) + du, -0.4, 0.4)), numberOffsetY: r3(clamp((s.lettering.numberOffsetY ?? 0) + dv, -0.3, 0.3)) };
      if (t.mode === "scale") s.lettering = { ...s.lettering, numberScale: r3(clamp((s.lettering.numberScale ?? 1) * k, 0.5, 1.6)) };
      return s;
    case "name":
      if (t.mode === "move")
        s.lettering = { ...s.lettering, nameOffsetX: r3(clamp((s.lettering.nameOffsetX ?? 0) + du, -0.4, 0.4)), nameOffsetY: r3(clamp((s.lettering.nameOffsetY ?? 0) + dv, -0.3, 0.3)) };
      if (t.mode === "scale") s.lettering = { ...s.lettering, nameScale: r3(clamp((s.lettering.nameScale ?? 1) * k, 0.5, 1.8)) };
      return s;
    case "patch:alternate":
    case "patch:captain": {
      const kind = id === "patch:alternate" ? "alternate" : "captain";
      if (t.mode === "scale") s.patches = { ...s.patches, [kind]: { ...s.patches[kind], scale: r3(clamp((s.patches[kind].scale ?? 1) * k, 0.5, 2)) } };
      return s;
    }
  }
  if (!id.startsWith("g:")) return start;
  const m = materialize(s);
  const gid = id.slice(2);
  const f = frameFor(m.product, pl, W, H);
  // graphics heights use the frame's unit (the front piece for the body)
  const gv = (t.mode === "move" || t.mode === "depth" ? t.dy : 0) / f.unit;
  const gu = (t.mode === "move" ? t.dx : 0) / f.w;
  m.graphics = m.graphics.map((g): Graphic => {
    if (g.id !== gid) return g;
    switch (g.kind) {
      case "panel":
        if (t.mode === "move") return pl.startsWith("sleeve") ? { ...g, sleeveY: r3(clamp(g.sleeveY + gv, 0, 1)) } : { ...g, y: r3(clamp(g.y + gv, -0.1, 1.1)), points: g.points.map(([x, y]) => [x, r3(y + gv)] as [number, number]) };
        if (t.mode === "depth") {
          // the point moves, the sides stay where they are
          const sides = g.y + g.depth;
          const y = clamp(g.y + gv, -0.1, 1.1);
          return { ...g, y: r3(y), depth: r3(clamp(sides - y, -0.6, 0.6)) };
        }
        return { ...g, trim: g.trim.map((x) => ({ ...x, width: r3(clamp(x.width * k, 0.003, 0.08)) })) };
      case "stripes":
        if (t.mode === "move") return { ...g, y: r3(clamp(g.y + gv, 0, 1)) };
        if (t.mode === "scale") return { ...g, bands: g.bands.map((b) => ({ ...b, width: r3(clamp(b.width * k, 0.003, 0.2)), gap: r3(clamp(b.gap * k, 0, 0.2)) })) };
        return g;
      case "yoke":
        if (t.mode === "move") return { ...g, depth: r3(clamp(g.depth + gv, 0.04, 0.45)) };
        return g;
      case "sash":
        if (t.mode === "move") return { ...g, from: r3(clamp(g.from + gv, -0.2, 1.2)), to: r3(clamp(g.to + gv, -0.2, 1.2)) };
        if (t.mode === "scale") return { ...g, width: r3(clamp(g.width * k, 0.02, 0.4)) };
        return g;
      case "side_panels":
        if (t.mode === "move") return { ...g, top: r3(clamp(g.top + gv, 0, 0.9)) };
        if (t.mode === "scale") return { ...g, width: r3(clamp(g.width * k, 0.02, 0.35)) };
        void gu;
        return g;
    }
  });
  return m;
}
