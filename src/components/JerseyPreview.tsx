"use client";

import { useId, useMemo } from "react";
import { productByKey, type Placement } from "@/lib/catalog";
import type { DesignSpec, Player } from "@/lib/design-spec";
import { renderPanelInner } from "@/lib/render";

// Flat garment preview. Each print panel is rendered with the same code as the
// print files, then clipped into a jersey silhouette.
const PW = 900;
const PH = 1080;

type Shape = { body: string; sleeves?: [string, string]; collar: string };

const SHAPES: Record<"tee" | "long" | "tank", Shape> = {
  tee: {
    body: "M245 55 Q300 105 355 55 L460 100 L460 640 L140 640 L140 100 Z",
    sleeves: ["M140 100 L245 55 L200 60 L60 140 L30 330 L140 345 Z", "M460 100 L355 55 L400 60 L540 140 L570 330 L460 345 Z"],
    collar: "M245 55 Q300 105 355 55",
  },
  long: {
    body: "M245 55 Q300 105 355 55 L460 100 L460 640 L140 640 L140 100 Z",
    sleeves: ["M140 100 L245 55 L200 60 L60 140 L10 560 L95 575 L140 330 Z", "M460 100 L355 55 L400 60 L540 140 L590 560 L505 575 L460 330 Z"],
    collar: "M245 55 Q300 105 355 55",
  },
  tank: {
    body: "M215 50 L250 50 Q300 130 350 50 L385 50 Q395 175 455 225 L455 640 L145 640 L145 225 Q205 175 215 50 Z",
    collar: "M250 50 Q300 130 350 50",
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
  const shape = shapeFor(spec);
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
        <linearGradient id={`${uid}shade`} x1="0" x2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.18" />
          <stop offset="0.25" stopColor="#000" stopOpacity="0" />
          <stop offset="0.75" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.18" />
        </linearGradient>
      </defs>
      {shape.sleeves && panel(shape.sleeves[0], panels.left, "left")}
      {shape.sleeves && panel(shape.sleeves[1], panels.right, "right")}
      {panel(shape.body, panels.body, "body")}
      <path d={shape.body} fill={`url(#${uid}shade)`} />
      <g fill="none" stroke="#000" strokeOpacity="0.35" strokeWidth="2" strokeLinejoin="round">
        <path d={shape.body} />
        {shape.sleeves?.map((d) => <path key={d} d={d} />)}
        <path d={view === "front" ? shape.collar : shape.collar.replace(/Q300 \d+/, "Q300 70")} strokeWidth="6" stroke={spec.colors.accent} strokeOpacity="1" />
      </g>
    </svg>
  );
}
