"use client";

import { useId, useMemo, useRef, useState } from "react";
import { allGraphics, pointInPoly, resolveColor } from "@/lib/graphics";
import { productByKey, type Placement } from "@/lib/catalog";
import type { DesignSpec, Player } from "@/lib/design-spec";
import { crossSeams, pieceFor, type Piece } from "@/lib/garments";
import { isLongSleeve, renderPanelInner, selectables, type Selectable } from "@/lib/render";

// Flat garment preview, built from the jersey's real cut pieces (garments.ts).
// Each print panel is rendered with the same code as the print files, at the
// real print-file size, and clipped to the fabric piece Printful cuts from it.
// The whole drawing works in print-file pixels (every panel is 150 dpi), so
// body, sleeves and shoulders keep their true relative sizes.

type Pt = { x: number; y: number };

// outline points in print-file pixels, per subpath
function outline(piece: Piece): Pt[][] {
  const sx = piece.dims.width / 1000;
  const sy = piece.dims.height / 1000;
  return piece.path
    .split("Z")
    .filter((s) => s.trim())
    .map((sub) => {
      const n = sub.match(/-?\d+(\.\d+)?/g)!.map(Number);
      const pts: Pt[] = [];
      for (let i = 0; i + 1 < n.length; i += 2) pts.push({ x: n[i] * sx, y: n[i + 1] * sy });
      return pts;
    });
}

function boxPx(piece: Piece) {
  const [x, y, w, h] = piece.box;
  return { x: x * piece.dims.width, y: y * piece.dims.height, w: w * piece.dims.width, h: h * piece.dims.height };
}

// Where a sleeve joins the body on the viewer's left: the shoulder point (the
// outer end of the top edge) and the armpit (where the armhole curve meets the
// side seam).
function armhole(subs: Pt[][], b: ReturnType<typeof boxPx>) {
  const all = subs.flat();
  const top = all.filter((p) => p.y <= b.y + 0.12 * b.h);
  const S = top.reduce((a, p) => (p.x < a.x ? p : a), top[0] ?? { x: b.x, y: b.y });
  // no clear turn: the top of the outermost edge (pieces in two parts), or
  // straight down from the shoulder (a separate shoulder piece holds the armhole)
  const upper = all.filter((p) => p.y < b.y + 0.7 * b.h);
  const minX = Math.min(...upper.map((p) => p.x));
  const side = upper.filter((p) => p.x <= minX + 0.01 * b.w);
  const edge = side.reduce((a, p) => (p.y < a.y ? p : a), side[0]);
  const fallback = edge && edge.y - S.y > 0.15 * b.h ? edge : { x: b.x, y: S.y + 0.28 * b.h };
  const ring = subs.find((pts) => pts.includes(S));
  if (!ring) return { S, A: fallback };
  // walk down the contour from the shoulder: the armhole curves in and then
  // back out; the armpit is where the edge turns to run straight down
  const n = ring.length;
  const i0 = ring.indexOf(S);
  const step = ring[(i0 + 1) % n].y >= ring[(i0 - 1 + n) % n].y ? 1 : -1;
  let maxX = S.x;
  let out = false;
  for (let k = 0, i = i0; k < n; k++) {
    const p = ring[i];
    const q = ring[(i + step + n) % n];
    // left the armhole: past the waist, or across toward the neck
    if (p.y > b.y + 0.7 * b.h || p.x > b.x + 0.35 * b.w) break;
    maxX = Math.max(maxX, p.x);
    if (maxX - p.x > 0.02 * b.w) out = true;
    if (out && Math.abs(q.x - p.x) < 0.3 * Math.abs(q.y - p.y)) return { S, A: p };
    i = (i + step + n) % n;
  }
  return { S, A: fallback };
}

const poly = (pts: Pt[]) => `M${pts.map((p) => `${p.x.toFixed(0)} ${p.y.toFixed(0)}`).join("L")}`;

// A change the customer makes by dragging on the jersey, measured from where
// the drag started, in the print-file pixels of the panel it happened on.
export type CanvasTransform =
  | { mode: "move"; dx: number; dy: number }
  | { mode: "scale"; factor: number }
  | { mode: "depth"; dy: number };

// parts that snap to the center line when dragged
const SNAP_IDS = new Set(["logo", "wordmark", "number", "name"]);

type DragState = {
  id: string;
  placement: Placement;
  mode: "move" | "scale" | "depth";
  el: SVGGElement;
  start: Pt;
  center: Pt;
  moved: boolean;
};

const inRect = (p: Pt, r: NonNullable<Selectable["rect"]>, pad: number) =>
  p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;

function hitTest(list: Selectable[] | undefined, p: Pt, pad: number, prefer?: string | null): string | null {
  if (!list) return null;
  const hits = list.filter((s) => (s.rect ? inRect(p, s.rect, pad) : s.poly?.some((poly) => pointInPoly(p, poly))));
  if (!hits.length) return null;
  // clicking the selected part again keeps it, so it can be dragged even under text
  if (prefer && hits.some((h) => h.id === prefer) && !hits[0].rect) return prefer;
  return hits[0].id;
}

function bboxOf(s: Selectable) {
  if (s.rect) return s.rect;
  const pts = (s.poly ?? []).flat();
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

export function JerseyPreview({
  spec,
  player,
  view,
  className,
  selected,
  onSelect,
  onTransform,
}: {
  spec: DesignSpec;
  player: Player;
  view: "front" | "back";
  className?: string;
  // canvas editing: the selected part's id ("body" for the bare jersey)
  selected?: string | null;
  onSelect?: (id: string | null, placement: Placement) => void;
  // a drag on the selected part; phase "end" when the pointer is released
  onTransform?: (id: string, placement: Placement, t: CanvasTransform, phase: "move" | "end") => void;
}) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const panelRefs = useRef<Partial<Record<Placement, SVGGElement | null>>>({});
  const drag = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [snapped, setSnapped] = useState(false);
  const editable = !!onSelect;

  const g = useMemo(() => {
    const product = productByKey(spec.product);
    const placements = product?.placements ?? ["front", "back"];
    const body = pieceFor(spec.product, view);
    const b = boxPx(body);
    const subs = outline(body);
    const sleeved = placements.includes("sleeve_left");
    const yoked = placements.includes("yoke");
    const cx = b.x + b.w / 2;

    const panel = (pl: Placement, w: number, h: number) =>
      renderPanelInner(spec, pl, { width: w, height: h, player, idPrefix: `${uid}${view}${pl}` });

    // sleeves: viewer's left is the wearer's right from the front
    type Sleeve = { pl: Placement; transform: string; vb: string; w: number; h: number; clip: string; inner: string; pw: number; ph: number; long: boolean };
    const sleeves: Sleeve[] = [];
    let yokeShape: string | null = null;
    let neck: Pt[] | null = null;
    const bounds = { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h };
    const grow = (p: Pt) => {
      bounds.x0 = Math.min(bounds.x0, p.x);
      bounds.x1 = Math.max(bounds.x1, p.x);
      bounds.y0 = Math.min(bounds.y0, p.y);
      bounds.y1 = Math.max(bounds.y1, p.y);
    };

    const left = armhole(subs, b);
    const mirror = (p: Pt): Pt => ({ x: 2 * cx - p.x, y: p.y });
    const yh = 0.16 * b.w; // shoulder piece rise above the body
    const shoulderTop = (S: Pt, side: -1 | 1): Pt => ({ x: S.x + side * 0.02 * b.w, y: S.y - yh * 0.4 });

    if (sleeved) {
      for (const side of [-1, 1] as const) {
        const pl: Placement =
          view === "front" ? (side < 0 ? "sleeve_right" : "sleeve_left") : side < 0 ? "sleeve_left" : "sleeve_right";
        const sp = pieceFor(spec.product, pl);
        const sb = boxPx(sp);
        const long = isLongSleeve(spec, pl);
        const S0 = side < 0 ? left.S : mirror(left.S);
        const A = side < 0 ? left.A : mirror(left.A);
        const S = yoked ? shoulderTop(S0, side) : S0;
        const span = Math.hypot(S.x - A.x, S.y - A.y);
        // show the part of the sleeve facing the viewer, about as wide as the armhole
        const vis = Math.min(Math.max(span / sb.w, 0.35), 0.8) * sb.w;
        const theta = long ? 26 : 58;
        const rad = (theta * Math.PI) / 180;
        // tuck the sleeve top a little under the body so no gap shows
        const tuck = long ? 0.06 : 0.16;
        const M = { x: (S.x + A.x) / 2 - side * tuck * vis * Math.cos(rad), y: (S.y + A.y) / 2 - tuck * 0.7 * vis * Math.sin(rad) };
        const L = sb.h;
        const taper = long ? 0.72 : 0.92;
        const local = [
          { x: -vis / 2, y: 0 },
          { x: vis / 2, y: 0 },
          { x: (vis / 2) * taper, y: L },
          { x: (-vis / 2) * taper, y: L },
        ];
        const ang = -side * theta;
        for (const p of local) {
          const r = (ang * Math.PI) / 180;
          grow({ x: M.x + p.x * Math.cos(r) - p.y * Math.sin(r), y: M.y + p.x * Math.sin(r) + p.y * Math.cos(r) });
        }
        sleeves.push({
          pl,
          long,
          transform: `translate(${M.x.toFixed(0)} ${M.y.toFixed(0)}) rotate(${ang})`,
          // the visible band of the sleeve panel: centered, full piece height
          vb: `${(sb.x + sb.w / 2 - vis / 2).toFixed(0)} ${sb.y.toFixed(0)} ${vis.toFixed(0)} ${L.toFixed(0)}`,
          w: vis,
          h: L,
          clip: `M${-vis / 2} 0L${vis / 2} 0L${(vis / 2) * taper} ${L}Q0 ${L * 1.015} ${(-vis / 2) * taper} ${L}Z`,
          inner: panel(pl, sp.dims.width, sp.dims.height),
          pw: sp.dims.width,
          ph: sp.dims.height,
        });
      }
    }

    if (yoked) {
      // the separate shoulder piece, from the neck down to the body's top edge
      const SL = left.S;
      const SR = mirror(left.S);
      const tl = shoulderTop(SL, -1);
      const tr = shoulderTop(SR, 1);
      const nw = 0.17 * b.w;
      const neckTop = b.y - yh;
      const dip = view === "front" ? b.y - yh * 0.05 : neckTop + yh * 0.22;
      neck = [
        { x: cx - nw, y: neckTop },
        { x: cx - nw * 0.45, y: (neckTop + dip) / 2 + yh * 0.12 },
        { x: cx, y: dip },
        { x: cx + nw * 0.45, y: (neckTop + dip) / 2 + yh * 0.12 },
        { x: cx + nw, y: neckTop },
      ];
      const pts = [
        { x: SL.x, y: SL.y + 0.25 * b.h },
        { x: tl.x - 0.03 * b.w, y: SL.y + 0.05 * b.h },
        tl,
        ...neck,
        tr,
        { x: tr.x + 0.03 * b.w, y: SR.y + 0.05 * b.h },
        { x: SR.x, y: SR.y + 0.25 * b.h },
      ];
      pts.forEach(grow);
      yokeShape = `${poly(pts)}Z`;
    }

    const yokePiece = yoked ? pieceFor(spec.product, "yoke") : null;
    const pad = 0.04 * b.w;
    return {
      body,
      b,
      bodyInner: panel(view, body.dims.width, body.dims.height),
      sleeves,
      yokeShape,
      yokeInner: yokePiece ? panel("yoke", yokePiece.dims.width, yokePiece.dims.height) : null,
      yokeDims: yokePiece?.dims,
      neck,
      cx,
      viewBox: `${(bounds.x0 - pad).toFixed(0)} ${(bounds.y0 - pad).toFixed(0)} ${(bounds.x1 - bounds.x0 + 2 * pad).toFixed(0)} ${(bounds.y1 - bounds.y0 + 2.6 * pad).toFixed(0)}`,
      // what can be clicked on each visible panel, top-most first
      hits: (!editable ? {} : Object.fromEntries(
        [view, ...sleeves.map((s) => s.pl), ...(yokePiece ? ["yoke" as Placement] : [])].map((pl) => {
          const d = pieceFor(spec.product, pl).dims;
          return [pl, selectables(spec, pl, player, d.width, d.height)];
        })
      )) as Partial<Record<Placement, Selectable[]>>,
    };
  }, [spec, player, view, uid, editable]);

  const { body, b } = g;
  const W = body.dims.width;
  const H = body.dims.height;
  const bodyPath = `scale(${W / 1000} ${H / 1000})`;
  const stroke = b.w / 450;
  const collar = spec.collar?.color ?? "accent";
  const collarColor = collar === "none" ? null : resolveColor(spec, collar);
  const yokeGraphic = allGraphics(spec).find((x) => x.kind === "yoke" && !x.hidden);
  const yokeColor = yokeGraphic && yokeGraphic.kind === "yoke" ? resolveColor(spec, yokeGraphic.color) : null;

  // pointer position in a panel's own print-file pixels
  const local = (el: SVGGElement, e: React.PointerEvent): Pt | null => {
    const m = el.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };
  const padFor = (pl: Placement) => pieceFor(spec.product, pl).dims.width * 0.012;
  const centerX = (pl: Placement) => {
    const p = pieceFor(spec.product, pl);
    return (p.box[0] + p.box[2] / 2) * p.dims.width;
  };

  const startDrag = (e: React.PointerEvent, pl: Placement, id: string, mode: DragState["mode"], center: Pt) => {
    const el = panelRefs.current[pl];
    if (!el || !onTransform) return;
    const p = local(el, e);
    if (!p) return;
    svgRef.current?.setPointerCapture?.(e.pointerId);
    drag.current = { id, placement: pl, mode, el, start: p, center, moved: false };
    setDragging(true);
    e.preventDefault();
    e.stopPropagation();
  };

  const panelHandlers = (pl: Placement) =>
    editable
      ? {
          onPointerDown: (e: React.PointerEvent) => {
            const el = panelRefs.current[pl];
            if (!el || e.button !== 0) return;
            const p = local(el, e);
            if (!p) return;
            const id = hitTest(g.hits[pl], p, padFor(pl), selected) ?? "body";
            onSelect?.(id, pl);
            if (id !== "body") {
              const s = g.hits[pl]?.find((x) => x.id === id);
              const bb = s ? bboxOf(s) : { x: p.x, y: p.y, w: 0, h: 0 };
              startDrag(e, pl, id, "move", { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 });
            }
          },
          onPointerMove: (e: React.PointerEvent) => {
            if (drag.current) return;
            const el = panelRefs.current[pl];
            const p = el && local(el, e);
            setHover(p ? hitTest(g.hits[pl], p, padFor(pl), selected) : null);
          },
          onPointerLeave: () => setHover(null),
        }
      : {};

  const svgHandlers = editable
    ? {
        onPointerMove: (e: React.PointerEvent) => {
          const d = drag.current;
          if (!d || !onTransform) return;
          const p = local(d.el, e);
          if (!p) return;
          const dx = p.x - d.start.x;
          const dy = p.y - d.start.y;
          if (!d.moved && Math.hypot(dx, dy) < padFor(d.placement) * 0.5) return;
          d.moved = true;
          if (d.mode === "move") {
            // snap to the center line of the piece
            const cxp = centerX(d.placement);
            const snap = SNAP_IDS.has(d.id) && Math.abs(d.center.x + dx - cxp) < padFor(d.placement) * 1.2;
            setSnapped(snap);
            onTransform(d.id, d.placement, { mode: "move", dx: snap ? cxp - d.center.x : dx, dy }, "move");
          }
          else if (d.mode === "depth") onTransform(d.id, d.placement, { mode: "depth", dy }, "move");
          else {
            const r0 = Math.hypot(d.start.x - d.center.x, d.start.y - d.center.y) || 1;
            const r1 = Math.hypot(p.x - d.center.x, p.y - d.center.y);
            onTransform(d.id, d.placement, { mode: "scale", factor: r1 / r0 }, "move");
          }
        },
        onPointerUp: () => {
          const d = drag.current;
          drag.current = null;
          setDragging(false);
          setSnapped(false);
          if (d?.moved && onTransform) onTransform(d.id, d.placement, { mode: "move", dx: 0, dy: 0 }, "end");
        },
        onPointerCancel: () => {
          drag.current = null;
          setDragging(false);
        },
      }
    : {};

  // selection outline and handles for one panel, in its own pixels
  const overlay = (pl: Placement) => {
    if (!editable) return null;
    const list = g.hits[pl] ?? [];
    const sel = list.filter((s) => s.id === selected);
    const hov = hover && hover !== selected ? list.filter((s) => s.id === hover) : [];
    const pw = pieceFor(spec.product, pl).dims.width;
    const sw = pw / 260;
    const hr = pw / 75;
    const dash = `${pw / 70} ${pw / 110}`;
    const piece = pieceFor(spec.product, pl);
    const d = drag.current;
    const guides = dragging && d && d.placement === pl && d.mode === "move" && SNAP_IDS.has(d.id);
    const pb = { x: piece.box[0] * piece.dims.width, y: piece.box[1] * piece.dims.height, w: piece.box[2] * piece.dims.width, h: piece.box[3] * piece.dims.height };
    return (
      <g style={{ pointerEvents: "none" }}>
        {guides && (
          <>
            {/* seams: names and numbers can't sit here, anything else risks being sewn in */}
            {crossSeams(spec.product, pl).map(([s0, s1], i) => {
              const y0 = pb.y + Math.max(0, s0) * pb.h;
              const y1 = pb.y + s1 * pb.h;
              return <rect key={`seam${i}`} x={pb.x} y={y0} width={pb.w} height={Math.max(0, y1 - y0)} fill="#FF4D4D" fillOpacity="0.28" stroke="#FF4D4D" strokeWidth={sw} strokeDasharray={dash} />;
            })}
            <line x1={pb.x + pb.w / 2} x2={pb.x + pb.w / 2} y1={pb.y} y2={pb.y + pb.h} stroke={snapped ? "#C6FF3D" : "#fff"} strokeOpacity={snapped ? 1 : 0.55} strokeWidth={sw * (snapped ? 1.6 : 1)} strokeDasharray={snapped ? undefined : dash} />
          </>
        )}
        {hov.map((s, i) =>
          s.rect ? (
            <rect key={`h${i}`} x={s.rect.x} y={s.rect.y} width={s.rect.w} height={s.rect.h} fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth={sw} strokeDasharray={dash} />
          ) : (
            (s.poly ?? []).map((poly, j) => <path key={`h${i}${j}`} d={`${poly.length ? poly.map((p, k) => `${k ? "L" : "M"}${p.x.toFixed(0)} ${p.y.toFixed(0)}`).join("") : ""}Z`} fill="#fff" fillOpacity="0.08" stroke="#fff" strokeOpacity="0.5" strokeWidth={sw} strokeDasharray={dash} />)
          )
        )}
        {sel.map((s, i) => {
          const bb = bboxOf(s);
          const center = { x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 };
          const corners = s.rect ? [
            { x: bb.x, y: bb.y },
            { x: bb.x + bb.w, y: bb.y },
            { x: bb.x, y: bb.y + bb.h },
            { x: bb.x + bb.w, y: bb.y + bb.h },
          ] : [];
          // stripe sets and sashes resize from a handle at their right end
          const id = s.id;
          const g0 = id.startsWith("g:") ? allGraphics(spec).find((x) => `g:${x.id}` === id) : undefined;
          if (g0 && (g0.kind === "stripes" || g0.kind === "sash" || g0.kind === "side_panels")) {
            const piece = pieceFor(spec.product, pl);
            const right = Math.min(bb.x + bb.w, (piece.box[0] + piece.box[2]) * piece.dims.width - hr * 1.5);
            corners.push({ x: right, y: bb.y + bb.h });
          }
          const guide = s.guide;
          const mid = guide && g0?.kind === "panel" && g0.edge !== "straight" && g0.edge !== "custom" ? guide.reduce((a, p) => (Math.abs(p.x - center.x) < Math.abs(a.x - center.x) ? p : a), guide[0]) : null;
          return (
            <g key={`s${i}`}>
              {s.rect ? (
                <rect x={bb.x} y={bb.y} width={bb.w} height={bb.h} fill="none" stroke="#C6FF3D" strokeWidth={sw * 1.4} strokeDasharray={dash} />
              ) : guide ? (
                <path d={guide.map((p, k) => `${k ? "L" : "M"}${p.x.toFixed(0)} ${p.y.toFixed(0)}`).join("")} fill="none" stroke="#C6FF3D" strokeWidth={sw * 2} strokeDasharray={dash} />
              ) : (
                (s.poly ?? []).map((poly, j) => <path key={j} d={`${poly.map((p, k) => `${k ? "L" : "M"}${p.x.toFixed(0)} ${p.y.toFixed(0)}`).join("")}Z`} fill="#C6FF3D" fillOpacity="0.1" stroke="#C6FF3D" strokeWidth={sw * 1.4} strokeDasharray={dash} />)
              )}
              {onTransform &&
                corners.map((c, k) => (
                  <circle
                    key={k}
                    cx={c.x}
                    cy={c.y}
                    r={hr}
                    fill="#fff"
                    stroke="#111"
                    strokeWidth={sw}
                    style={{ pointerEvents: "all", cursor: "nwse-resize" }}
                    onPointerDown={(e) => startDrag(e, pl, s.id, "scale", center)}
                  />
                ))}
              {onTransform && mid && (
                <rect
                  x={mid.x - hr}
                  y={mid.y - hr}
                  width={hr * 2}
                  height={hr * 2}
                  fill="#C6FF3D"
                  stroke="#111"
                  strokeWidth={sw}
                  transform={`rotate(45 ${mid.x} ${mid.y})`}
                  style={{ pointerEvents: "all", cursor: "ns-resize" }}
                  onPointerDown={(e) => startDrag(e, pl, s.id, "depth", center)}
                >
                  <title>Drag to change the point</title>
                </rect>
              )}
            </g>
          );
        })}
      </g>
    );
  };

  const cursor = dragging ? "grabbing" : hover ? (hover === selected ? "move" : "pointer") : undefined;

  return (
    <svg
      ref={svgRef}
      viewBox={g.viewBox}
      className={className}
      role="img"
      aria-label={`${view} of jersey`}
      style={{ cursor, touchAction: editable ? "none" : undefined, userSelect: "none" }}
      {...svgHandlers}
    >
      <defs>
        <clipPath id={`${uid}body`}>
          <path d={body.path} transform={bodyPath} />
        </clipPath>
        {g.sleeves.map((s) => (
          <clipPath id={`${uid}${s.pl}`} key={s.pl}>
            <path d={s.clip} />
          </clipPath>
        ))}
        {g.yokeShape && (
          <clipPath id={`${uid}yoke`}>
            <path d={g.yokeShape} />
          </clipPath>
        )}
        <linearGradient id={`${uid}shade`} x1="0" x2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.22" />
          <stop offset="0.2" stopColor="#000" stopOpacity="0" />
          <stop offset="0.8" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id={`${uid}sshade`} x1="0" x2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.2" />
          <stop offset="0.5" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.2" />
        </linearGradient>
      </defs>

      {editable && <rect x="-100000" y="-100000" width="200000" height="200000" fill="transparent" onPointerDown={() => onSelect?.(null, view)} />}

      {g.sleeves.map((s) => (
        <g key={s.pl} transform={s.transform}>
          <g clipPath={`url(#${uid}${s.pl})`} {...panelHandlers(s.pl)}>
            <svg x={-s.w / 2} y={0} width={s.w} height={s.h} viewBox={s.vb} preserveAspectRatio="none" overflow="hidden">
              <g ref={(el) => { panelRefs.current[s.pl] = el; }} dangerouslySetInnerHTML={{ __html: s.inner }} />
              {overlay(s.pl)}
            </svg>
            {/* raglan sleeves run under the shoulder piece up to the neck */}
            {s.long && g.yokeShape && yokeColor && <rect x={-s.w} y={0} width={s.w * 2} height={s.h * 0.17} fill={yokeColor} style={{ pointerEvents: "none" }} />}
            <rect x={-s.w / 2} y={0} width={s.w} height={s.h} fill={`url(#${uid}sshade)`} style={{ pointerEvents: "none" }} />
          </g>
          <path d={s.clip} fill="none" stroke="#000" strokeOpacity="0.3" strokeWidth={stroke} style={{ pointerEvents: "none" }} />
        </g>
      ))}

      {g.yokeShape && g.yokeInner && g.yokeDims && (
        <g>
          <g clipPath={`url(#${uid}yoke)`} {...panelHandlers("yoke")}>
            <svg
              x={b.x - 0.1 * b.w}
              y={b.y - 0.3 * b.w}
              width={b.w * 1.2}
              height={b.w * 0.6}
              viewBox={`0 0 ${g.yokeDims.width} ${g.yokeDims.height}`}
              preserveAspectRatio="xMidYMid slice"
            >
              <g ref={(el) => { panelRefs.current.yoke = el; }} dangerouslySetInnerHTML={{ __html: g.yokeInner }} />
              {overlay("yoke")}
            </svg>
          </g>
          <path d={g.yokeShape} fill="none" stroke="#000" strokeOpacity="0.3" strokeWidth={stroke} style={{ pointerEvents: "none" }} />
        </g>
      )}

      <g clipPath={`url(#${uid}body)`} {...panelHandlers(view)}>
        <g ref={(el) => { panelRefs.current[view] = el; }} dangerouslySetInnerHTML={{ __html: g.bodyInner }} />
        <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={`url(#${uid}shade)`} style={{ pointerEvents: "none" }} />
        {overlay(view)}
      </g>
      <path d={body.path} transform={bodyPath} fill="none" stroke="#000" strokeOpacity="0.3" strokeWidth={stroke} vectorEffect="non-scaling-stroke" style={{ strokeWidth: 1.5, pointerEvents: "none" }} />

      {/* the separate shoulder piece is drawn simplified, so its collar is too
          (other jerseys show the collar printed on the body piece) */}
      {g.neck && (
        <path
          d={poly(g.neck)}
          fill="none"
          stroke={collarColor ?? yokeColor ?? spec.colors.primary}
          strokeWidth={b.w * 0.022}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={editable ? { cursor: "pointer" } : { pointerEvents: "none" }}
          onPointerDown={editable ? (e) => { e.stopPropagation(); onSelect?.("collar", view); } : undefined}
        />
      )}
      {g.neck && editable && selected === "collar" && (
        <path d={poly(g.neck)} fill="none" stroke="#C6FF3D" strokeWidth={b.w * 0.006} strokeDasharray={`${b.w / 70} ${b.w / 110}`} style={{ pointerEvents: "none" }} />
      )}
    </svg>
  );
}
