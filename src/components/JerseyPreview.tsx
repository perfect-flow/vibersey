"use client";

import { useId, useMemo } from "react";
import { productByKey, type Placement } from "@/lib/catalog";
import type { DesignSpec, Player } from "@/lib/design-spec";
import { renderPanelInner } from "@/lib/render";

// Flat garment preview. Each print panel is rendered with the same code as the
// print files, then clipped into a jersey silhouette.
const PW = 900;
const PH = 1080;

type Shape = { body: string; sleeves?: [string, string]; collar: string; armholes?: [string, string] };

// Silhouettes are drawn close to the print panels' proportions (about 4:5),
// so graphics near the side seams show up in the preview the way they print.
const SHAPES: Record<"tee" | "long" | "tank", Shape> = {
  tee: {
    body: "M240 110 Q300 160 360 110 L480 155 L480 615 L120 615 L120 155 Z",
    sleeves: ["M120 155 L240 110 L190 116 L50 195 L15 380 L120 395 Z", "M480 155 L360 110 L410 116 L550 195 L585 380 L480 395 Z"],
    collar: "M240 110 Q300 160 360 110",
  },
  long: {
    body: "M240 110 Q300 160 360 110 L480 155 L480 615 L120 615 L120 155 Z",
    sleeves: ["M120 155 L240 110 L190 116 L50 195 L5 600 L90 612 L120 400 Z", "M480 155 L360 110 L410 116 L550 195 L595 600 L510 612 L480 400 Z"],
    collar: "M240 110 Q300 160 360 110",
  },
  tank: {
    body: "M195 70 L245 70 Q300 150 355 70 L405 70 Q415 205 495 250 L495 600 L105 600 L105 250 Q185 205 195 70 Z",
    collar: "M245 70 Q300 150 355 70",
    armholes: ["M105 250 Q185 205 195 70", "M405 70 Q415 205 495 250"],
  },
};

function bbox(d: string) {
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function shapeFor(spec: DesignSpec): Shape {
  const product = productByKey(spec.product);
  if (!product?.placements.includes("sleeve_left")) return SHAPES.tank;
  return spec.sport === "hockey" ? SHAPES.long : SHAPES.tee;
}

export function JerseyPreview({
  spec,
  player,
  view,
  className,
}: {
  spec: DesignSpec;
  player: Player;
  view: "front" | "back";
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const base = shapeFor(spec);
  // The back neckline sits much higher than the front scoop, so the body (and
  // its print) runs right up to the collar instead of leaving a gap.
  const backNeck = (d: string) => d.replace(/Q300 (\d+)/, (_, y) => `Q300 ${Number(y) - 35}`);
  const shape: Shape = view === "back" ? { ...base, body: backNeck(base.body), collar: backNeck(base.collar) } : base;
  // Sleeves render at their own aspect ratio so sleeve numbers aren't cropped.
  const panels = useMemo(() => {
    const make = (pl: Placement, w: number, h: number, fit?: { dx: number; scale: number }) => ({
      inner: renderPanelInner(spec, pl, { width: w, height: h, player, idPrefix: `${uid}${pl}`, fit }),
      w,
      h,
    });
    const sb = shape.sleeves ? bbox(shape.sleeves[0]) : { w: PW, h: PH };
    const sw = Math.round(sb.w * 3);
    const sh = Math.round(sb.h * 3);
    return {
      body: make(view, PW, PH),
      // from the back, the wearer's right sleeve is on the viewer's left
      left: make(view === "front" ? "sleeve_right" : "sleeve_left", sw, sh, { dx: -0.17, scale: 0.6 }),
      right: make(view === "front" ? "sleeve_left" : "sleeve_right", sw, sh, { dx: 0.17, scale: 0.6 }),
    };
  }, [spec, player, view, uid, shape.sleeves]);

  const panel = (d: string, p: { inner: string; w: number; h: number }, key: string) => {
    const b = bbox(d);
    return (
      <g key={key} clipPath={`url(#${uid}${key})`}>
        <svg
          x={b.x}
          y={b.y}
          width={b.w}
          height={b.h}
          viewBox={`0 0 ${p.w} ${p.h}`}
          preserveAspectRatio="xMidYMid slice"
          dangerouslySetInnerHTML={{ __html: p.inner }}
        />
      </g>
    );
  };

  // the inside of the back collar, seen through the front neck opening
  const neckInside = view === "front" ? `${backNeck(shape.collar)} ${shape.collar.replace(/^M(\S+) (\S+) Q300 (\d+) (\S+) (\S+)$/, "L$4 $5 Q300 $3 $1 $2")} Z` : null;
  const trim = spec.colors.accent;
  const sil = [shape.body, ...(shape.sleeves ?? [])];

  return (
    <svg viewBox="0 0 600 660" className={className} role="img" aria-label={`${view} of jersey`}>
      <defs>
        <clipPath id={`${uid}body`}>
          <path d={shape.body} />
        </clipPath>
        {shape.sleeves && (
          <>
            <clipPath id={`${uid}left`}>
              <path d={shape.sleeves[0]} />
            </clipPath>
            <clipPath id={`${uid}right`}>
              <path d={shape.sleeves[1]} />
            </clipPath>
          </>
        )}
        <clipPath id={`${uid}all`}>
          {sil.map((d) => (
            <path key={d} d={d} />
          ))}
        </clipPath>
        {/* fabric lighting: darker at the side seams and hem, a soft highlight across the chest */}
        <linearGradient id={`${uid}shade`} x1="0" x2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.28" />
          <stop offset="0.18" stopColor="#000" stopOpacity="0.04" />
          <stop offset="0.42" stopColor="#fff" stopOpacity="0.07" />
          <stop offset="0.6" stopColor="#000" stopOpacity="0" />
          <stop offset="0.85" stopColor="#000" stopOpacity="0.06" />
          <stop offset="1" stopColor="#000" stopOpacity="0.3" />
        </linearGradient>
        <linearGradient id={`${uid}vshade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.85" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.16" />
        </linearGradient>
        <filter id={`${uid}soft`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id={`${uid}drop`} x="-10%" y="-10%" width="120%" height="130%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      {/* ground shadow */}
      <g opacity="0.22" filter={`url(#${uid}drop)`} transform="translate(0 10)">
        {sil.map((d) => (
          <path key={d} d={d} fill="#000" />
        ))}
      </g>
      {neckInside && <path d={neckInside} fill="#000" fillOpacity="0.55" />}
      {shape.sleeves && panel(shape.sleeves[0], panels.left, "left")}
      {shape.sleeves && panel(shape.sleeves[1], panels.right, "right")}
      {panel(shape.body, panels.body, "body")}
      <g clipPath={`url(#${uid}all)`} style={{ pointerEvents: "none" }}>
        <rect x="0" y="0" width="600" height="660" fill={`url(#${uid}vshade)`} />
        <path d={shape.body} fill={`url(#${uid}shade)`} />
        {/* soft fabric folds */}
        <g filter={`url(#${uid}soft)`} fill="none" strokeLinecap="round">
          <path d="M215 330 Q235 430 205 545" stroke="#000" strokeOpacity="0.1" strokeWidth="14" />
          <path d="M392 300 Q372 410 398 540" stroke="#000" strokeOpacity="0.08" strokeWidth="12" />
          <path d="M270 200 Q300 260 285 360" stroke="#fff" strokeOpacity="0.06" strokeWidth="18" />
          {shape.sleeves && <path d="M95 210 Q80 280 70 360" stroke="#000" strokeOpacity="0.1" strokeWidth="12" />}
          {shape.sleeves && <path d="M505 210 Q520 280 530 360" stroke="#000" strokeOpacity="0.1" strokeWidth="12" />}
        </g>
      </g>
      <g fill="none" strokeLinejoin="round">
        {sil.map((d) => (
          <path key={d} d={d} stroke="#000" strokeOpacity="0.28" strokeWidth="1.5" />
        ))}
        {/* sewn seams */}
        {shape.sleeves && (
          <g stroke="#000" strokeOpacity="0.18" strokeWidth="1.2" strokeDasharray="3 3">
            <path d="M120 155 L120 395" />
            <path d="M480 155 L480 395" />
          </g>
        )}
        {shape.armholes?.map((d) => (
          <path key={d} d={d} stroke={trim} strokeWidth="7" strokeLinecap="round" />
        ))}
        <path d={shape.collar} strokeWidth="9" stroke={trim} strokeLinecap="round" />
        <path d={shape.collar} strokeWidth="1.2" stroke="#000" strokeOpacity="0.25" transform="translate(0 5)" />
      </g>
    </svg>
  );
}
