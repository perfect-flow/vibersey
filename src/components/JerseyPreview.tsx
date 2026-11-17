"use client";

import { useId, useMemo, useRef, useState } from "react";
import { productByKey, type Placement } from "@/lib/catalog";
import type { DesignSpec, Player } from "@/lib/design-spec";
import { pieceFor, type Piece } from "@/lib/garments";
import { isLongSleeve, logoRect, renderPanelInner } from "@/lib/render";

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

// The neckline as a run of outline points near the top center, if the piece has one.
function neckline(subs: Pt[][], b: ReturnType<typeof boxPx>): Pt[] | null {
  const cx = b.x + b.w / 2;
  const inNeck = (p: Pt) => Math.abs(p.x - cx) < 0.22 * b.w && p.y < b.y + 0.3 * b.h;
  for (const pts of subs) {
    const start = pts.findIndex((p) => !inNeck(p));
    if (start < 0) continue;
    const ring = [...pts.slice(start), ...pts.slice(0, start)];
    const run: Pt[] = [];
    let best: Pt[] = [];
    for (const p of ring) {
      if (inNeck(p)) run.push(p);
      else {
        if (run.length > best.length) best = [...run];
        run.length = 0;
      }
    }
    if (run.length > best.length) best = [...run];
    // a real neckline dips below the top edge
    if (best.length >= 3 && Math.max(...best.map((p) => p.y)) - b.y > 0.04 * b.h) return best;
  }
  return null;
}

const poly = (pts: Pt[]) => `M${pts.map((p) => `${p.x.toFixed(0)} ${p.y.toFixed(0)}`).join("L")}`;

export function JerseyPreview({
  spec,
  player,
  view,
  className,
  onLogoMove,
}: {
  spec: DesignSpec;
  player: Player;
  view: "front" | "back";
  className?: string;
  // drag the logo on this view; called with the drop point in piece fractions
  onLogoMove?: (x: number, y: number) => void;
}) {
  const uid = useId().replace(/:/g, "");
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const [hoverLogo, setHoverLogo] = useState(false);

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
    } else {
      neck = neckline(subs, b);
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
      logo: logoRect(spec, view),
    };
  }, [spec, player, view, uid]);

  const { body, b } = g;
  const W = body.dims.width;
  const H = body.dims.height;
  const bodyPath = `scale(${W / 1000} ${H / 1000})`;
  const stroke = b.w / 450;
  const trim = spec.colors.accent;

  // pointer position as fractions of the body piece box
  const toPiece = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { u: (p.x - b.x) / b.w, v: (p.y - b.y) / b.h, fx: p.x / W, fy: p.y / H };
  };
  const overLogo = (q: { fx: number; fy: number } | null) => {
    const r = g.logo;
    if (!q || !r) return false;
    const w = r.w ?? (r.h * H) / W;
    return Math.abs(q.fx - r.x) <= w / 2 && Math.abs(q.fy - r.y) <= r.h / 2;
  };
  const drag = onLogoMove && g.logo && spec.logo.url
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          if (!overLogo(toPiece(e))) return;
          (e.target as Element).setPointerCapture?.(e.pointerId);
          setDragging(true);
          e.preventDefault();
        },
        onPointerMove: (e: React.PointerEvent) => {
          const q = toPiece(e);
          if (dragging && q) onLogoMove(q.u, q.v);
          else setHoverLogo(overLogo(q));
        },
        onPointerUp: () => setDragging(false),
        onPointerCancel: () => setDragging(false),
        onPointerLeave: () => !dragging && setHoverLogo(false),
      }
    : {};

  return (
    <svg
      ref={svgRef}
      viewBox={g.viewBox}
      className={className}
      role="img"
      aria-label={`${view} of jersey`}
      style={{ cursor: dragging ? "grabbing" : hoverLogo ? "grab" : undefined, touchAction: dragging ? "none" : undefined }}
      {...drag}
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

      {g.sleeves.map((s) => (
        <g key={s.pl} transform={s.transform}>
          <g clipPath={`url(#${uid}${s.pl})`}>
            <svg x={-s.w / 2} y={0} width={s.w} height={s.h} viewBox={s.vb} preserveAspectRatio="none" overflow="hidden" dangerouslySetInnerHTML={{ __html: s.inner }} />
            {/* raglan sleeves run under the shoulder piece up to the neck */}
            {s.long && g.yokeShape && spec.trim.yoke && <rect x={-s.w} y={0} width={s.w * 2} height={s.h * 0.17} fill={spec.colors.secondary} />}
            <rect x={-s.w / 2} y={0} width={s.w} height={s.h} fill={`url(#${uid}sshade)`} />
          </g>
          <path d={s.clip} fill="none" stroke="#000" strokeOpacity="0.3" strokeWidth={stroke} />
        </g>
      ))}

      {g.yokeShape && g.yokeInner && g.yokeDims && (
        <g>
          <g clipPath={`url(#${uid}yoke)`}>
            <svg
              x={b.x - 0.1 * b.w}
              y={b.y - 0.3 * b.w}
              width={b.w * 1.2}
              height={b.w * 0.6}
              viewBox={`0 0 ${g.yokeDims.width} ${g.yokeDims.height}`}
              preserveAspectRatio="xMidYMid slice"
              dangerouslySetInnerHTML={{ __html: g.yokeInner }}
            />
          </g>
          <path d={g.yokeShape} fill="none" stroke="#000" strokeOpacity="0.3" strokeWidth={stroke} />
        </g>
      )}

      <g clipPath={`url(#${uid}body)`}>
        <g dangerouslySetInnerHTML={{ __html: g.bodyInner }} />
        <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={`url(#${uid}shade)`} style={{ pointerEvents: "none" }} />
      </g>
      <path d={body.path} transform={bodyPath} fill="none" stroke="#000" strokeOpacity="0.3" strokeWidth={stroke} vectorEffect="non-scaling-stroke" style={{ strokeWidth: 1.5 }} />

      {g.neck && (
        <path
          d={poly(g.neck)}
          fill="none"
          stroke={trim}
          strokeWidth={b.w * 0.022}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {hoverLogo && g.logo && !dragging && (
        <rect
          x={(g.logo.x - (g.logo.w ?? (g.logo.h * H) / W) / 2) * W}
          y={(g.logo.y - g.logo.h / 2) * H}
          width={(g.logo.w ?? (g.logo.h * H) / W) * W}
          height={g.logo.h * H}
          fill="none"
          stroke="#fff"
          strokeOpacity="0.8"
          strokeDasharray={`${b.w / 80} ${b.w / 120}`}
          strokeWidth={b.w / 300}
          style={{ pointerEvents: "none" }}
        />
      )}
    </svg>
  );
}
