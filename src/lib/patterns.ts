// Procedural sublimation graphics for all-over-print jerseys.
//
// Every pattern is vector SVG generated from the design's colors and a seed,
// so it stays sharp at Printful's print resolution, looks identical in the
// preview and the print file, and is exactly the same for every player on a
// team. Coordinates are in panel pixels (W x H); sizes scale with W so a
// 900 px preview and a 4500 px print file look the same.

import type { Placement } from "./catalog";
import { mix, tone } from "./color";

export type PatternCtx = {
  W: number;
  H: number;
  placement: Placement;
  primary: string;
  c1: string; // main graphic color
  c2: string; // second graphic color
  seed: number;
  scale: number; // 0.5..2, bigger = larger features
  idp: string; // unique id prefix
};

const f = (n: number) => (Math.round(n * 10) / 10).toString();
const isSleeve = (p: Placement) => p === "sleeve_left" || p === "sleeve_right";
const PLACEMENT_SALT: Record<Placement, number> = { front: 0, back: 7919, sleeve_left: 15583, sleeve_right: 27449, yoke: 38231 };

// Deterministic PRNG (mulberry32), so a design always renders the same.
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth 2D value noise in 0..1.
function noise2(seed: number) {
  const h = (x: number, y: number) => {
    let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n = n ^ (n >>> 16);
    return (n >>> 0) / 4294967296;
  };
  const s = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = s(x - xi);
    const v = s(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

function fbm(n: (x: number, y: number) => number, x: number, y: number, oct = 3) {
  let v = 0, amp = 0.5, fr = 1, tot = 0;
  for (let i = 0; i < oct; i++) {
    v += amp * n(x * fr, y * fr);
    tot += amp;
    amp *= 0.5;
    fr *= 2;
  }
  return v / tot;
}

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const poly = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join("") + "Z";

// A straight band between two points, `th` thick.
function band(x1: number, y1: number, x2: number, y2: number, th: number, fill: string, extra = "") {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * (th / 2), ny = (dx / len) * (th / 2);
  return `<path d="${poly([[x1 + nx, y1 + ny], [x2 + nx, y2 + ny], [x2 - nx, y2 - ny], [x1 - nx, y1 - ny]])}" fill="${fill}"${extra}/>`;
}

// ---------------------------------------------------------------------------

function sash(c: PatternCtx) {
  const { W, H } = c;
  if (isSleeve(c.placement)) return sleeveBands(c);
  const th = W * 0.24 * c.scale;
  const back = c.placement === "back";
  // front runs shoulder to opposite hip; the back continues it around the body
  const y1 = 0.08 * H, y2 = 0.86 * H;
  const x1 = back ? 1.1 * W : -0.1 * W;
  const x2 = back ? -0.1 * W : 1.1 * W;
  const off = th / 2 + W * 0.028;
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len, ny = dx / len;
  const op = back ? ` opacity="0.35"` : "";
  return [
    band(x1, y1, x2, y2, th, c.c1, op),
    band(x1 + nx * off, y1 + ny * off, x2 + nx * off, y2 + ny * off, W * 0.018, c.c2, op),
    band(x1 - nx * off, y1 - ny * off, x2 - nx * off, y2 - ny * off, W * 0.018, c.c2, op),
  ].join("");
}

// Bands across the lower sleeve, used by graphics that only make sense on the body.
function sleeveBands(c: PatternCtx) {
  const { W, H } = c;
  return `<rect x="0" y="${f(H * 0.7)}" width="${W}" height="${f(H * 0.06)}" fill="${c.c1}"/><rect x="0" y="${f(H * 0.775)}" width="${W}" height="${f(H * 0.02)}" fill="${c.c2}"/>`;
}

function chevron(c: PatternCtx) {
  const { W, H } = c;
  if (isSleeve(c.placement)) return sleeveBands(c);
  // a bold V across the torso, below the chest numbers
  const th = H * 0.085 * c.scale;
  const side = H * 0.4, tip = H * 0.7;
  const v = (dy: number, t: number, fill: string) =>
    `<path d="${poly([[-W * 0.02, side + dy], [W / 2, tip + dy], [W * 1.02, side + dy], [W * 1.02, side + dy + t], [W / 2, tip + dy + t], [-W * 0.02, side + dy + t]])}" fill="${fill}"/>`;
  return v(0, th, c.c1) + v(th + H * 0.015, H * 0.018, c.c2) + v(-H * 0.033, H * 0.018, c.c2);
}

function halftone(c: PatternCtx) {
  const { W, H, idp } = c;
  const cols = Math.round(26 / c.scale);
  const sp = W / cols;
  const rowH = sp * 0.866;
  const rows = Math.ceil(H / rowH) + 1;
  const dots: string[] = [];
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k <= cols; k++) {
      const x = (k + (r % 2 ? 0.5 : 0)) * sp;
      const y = r * rowH;
      const t = clamp(((y / H) * 0.85 + (x / W) * 0.15 - 0.32) / 0.6);
      const rad = sp * 0.5 * t ** 1.3;
      if (rad < sp * 0.05) continue;
      dots.push(`<circle cx="${f(x)}" cy="${f(y)}" r="${f(rad)}"/>`);
    }
  }
  return `<defs><linearGradient id="${idp}ht" x1="0" y1="0" x2="0" y2="1"><stop offset="0.3" stop-color="${c.primary}"/><stop offset="1" stop-color="${mix(c.primary, c.c2, 0.45)}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#${idp}ht)"/><g fill="${c.c1}">${dots.join("")}</g>`;
}

function camo(c: PatternCtx) {
  const { W, H } = c;
  const n = noise2(c.seed + PLACEMENT_SALT[c.placement]);
  const n2 = noise2(c.seed * 3 + 11 + PLACEMENT_SALT[c.placement]);
  const cols = Math.round(40 / c.scale);
  const cell = W / cols;
  const rows = Math.ceil(H / cell);
  const fills = [null, mix(c.primary, c.c1, 0.55), c.c1, c.c2];
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    let run = -1, runStart = 0;
    const flush = (end: number) => {
      if (run > 0) out.push(`<rect x="${f(runStart * cell)}" y="${f(r * cell)}" width="${f((end - runStart) * cell + 0.5)}" height="${f(cell + 0.5)}" fill="${fills[run]}"/>`);
    };
    for (let k = 0; k <= cols; k++) {
      let idx = 0;
      if (k < cols) {
        // two noise layers: big blobs plus smaller pixel clusters on top
        const a = fbm(n, (k * 0.5) / 4, (r * 0.5) / 4);
        const b = fbm(n2, (k * 0.5) / 2.2, (r * 0.5) / 2.2);
        idx = a > 0.6 ? 2 : a > 0.5 ? 1 : 0;
        if (b > 0.66) idx = 3;
        else if (b < 0.3 && idx === 0) idx = 1;
      }
      if (idx !== run) {
        flush(k);
        run = idx;
        runStart = k;
      }
    }
  }
  return out.join("");
}

function shards(c: PatternCtx) {
  const { W, H } = c;
  const R = rng(c.seed + PLACEMENT_SALT[c.placement]);
  const cols = Math.max(3, Math.round(5 / c.scale));
  const cw = W / cols;
  const rows = Math.ceil(H / cw);
  const ch = H / rows;
  const pts: [number, number][][] = [];
  for (let r = 0; r <= rows; r++) {
    pts[r] = [];
    for (let k = 0; k <= cols; k++) {
      const jx = k === 0 || k === cols ? 0 : (R() - 0.5) * cw * 0.8;
      const jy = r === 0 || r === rows ? 0 : (R() - 0.5) * ch * 0.8;
      pts[r][k] = [k * cw + jx, r * ch + jy];
    }
  }
  const shades = [c.primary, tone(c.primary, 0.07), tone(c.primary, 0.14), mix(c.primary, "#000000", 0.12)];
  const out: string[] = [];
  const tri = (a: [number, number], b: [number, number], d: [number, number], y: number) => {
    const roll = R();
    const lower = y / H;
    let fill = shades[Math.floor(R() * shades.length)];
    let op = 1;
    // accent shards get more frequent toward the hem
    if (roll < 0.05 + lower * 0.12) { fill = c.c1; op = 0.9; }
    else if (roll < 0.08 + lower * 0.18) { fill = c.c2; op = 0.75; }
    out.push(`<path d="${poly([a, b, d])}" fill="${fill}"${op < 1 ? ` fill-opacity="${op}"` : ""}/>`);
  };
  for (let r = 0; r < rows; r++)
    for (let k = 0; k < cols; k++) {
      const p00 = pts[r][k], p10 = pts[r][k + 1], p01 = pts[r + 1][k], p11 = pts[r + 1][k + 1];
      const y = (p00[1] + p11[1]) / 2;
      if (R() < 0.5) { tri(p00, p10, p11, y); tri(p00, p11, p01, y); }
      else { tri(p00, p10, p01, y); tri(p10, p11, p01, y); }
    }
  // fine facet lines
  const lines: string[] = [];
  for (let r = 0; r <= rows; r++) lines.push(pts[r].map(([x, y], i) => `${i ? "L" : "M"}${f(x)} ${f(y)}`).join(""));
  return out.join("") + `<path d="${lines.join("")}" fill="none" stroke="${tone(c.primary, 0.3)}" stroke-opacity="0.35" stroke-width="${f(W / 500)}"/>`;
}

function lightning(c: PatternCtx) {
  const { W, H, idp } = c;
  const R = rng(c.seed + PLACEMENT_SALT[c.placement]);
  const sleeve = isSleeve(c.placement);
  const count = sleeve ? 1 : 4;
  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    // keep the chest clear: bolts run down the sides
    const side = sleeve ? 0.5 : i % 2 ? 0.86 : 0.14;
    let x = W * (side + (R() - 0.5) * 0.12);
    let y = -H * 0.05;
    const pts: [number, number][] = [[x, y]];
    while (y < H * 1.05) {
      y += H * (0.05 + R() * 0.06);
      x += W * (R() - 0.5) * 0.16;
      x = clamp(x, W * (side - 0.14), W * (side + 0.14));
      pts.push([x, y]);
      if (R() < 0.18) {
        // a short branch
        const bx = x + W * (R() - 0.5) * 0.25, by = y + H * (0.06 + R() * 0.08);
        paths.push(`M${f(x)} ${f(y)}L${f((x + bx) / 2 + W * 0.02)} ${f((y + by) / 2)}L${f(bx)} ${f(by)}`);
      }
    }
    paths.push(pts.map(([px, py], j) => `${j ? "L" : "M"}${f(px)} ${f(py)}`).join(""));
  }
  const d = paths.join("");
  // glow from stacked translucent strokes (a blur filter is far too slow at print size)
  const glow = [0.075, 0.066, 0.058, 0.05, 0.043, 0.036, 0.03, 0.024]
    .map((w) => `<path d="${d}" fill="none" stroke="${c.c1}" stroke-width="${f(W * w)}" stroke-opacity="0.07" stroke-linejoin="round" stroke-linecap="round"/>`)
    .join("");
  return `<defs><linearGradient id="${idp}lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.primary}"/><stop offset="1" stop-color="${mix(c.primary, "#000000", 0.35)}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#${idp}lg)"/>${glow}<path d="${d}" fill="none" stroke="${c.c1}" stroke-width="${f(W * 0.016)}" stroke-linejoin="miter" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${mix(c.c1, "#FFFFFF", 0.7)}" stroke-opacity="0.9" stroke-width="${f(W * 0.004)}" stroke-linejoin="miter"/>`;
}

function topo(c: PatternCtx) {
  const { W, H } = c;
  const R = rng(c.seed + PLACEMENT_SALT[c.placement]);
  const n = noise2(c.seed + 5);
  const centers: [number, number][] = [
    [W * (0.15 + R() * 0.2), H * (0.55 + R() * 0.35)],
    [W * (0.7 + R() * 0.25), H * (0.1 + R() * 0.3)],
  ];
  const step = W * 0.055 * c.scale;
  const out: string[] = [];
  centers.forEach(([cx, cy], ci) => {
    for (let k = 1; k <= 14; k++) {
      const base = k * step;
      const pts: string[] = [];
      for (let a = 0; a <= 96; a++) {
        const th = (a / 96) * Math.PI * 2;
        const wob = (fbm(n, Math.cos(th) * 1.4 + ci * 9 + k * 0.08, Math.sin(th) * 1.4 + k * 0.08) - 0.5) * 2;
        const rr = base * (1 + wob * 0.35);
        pts.push(`${a ? "L" : "M"}${f(cx + Math.cos(th) * rr)} ${f(cy + Math.sin(th) * rr)}`);
      }
      out.push(pts.join("") + "Z");
    }
  });
  return `<path d="${out.join("")}" fill="none" stroke="${c.c1}" stroke-opacity="0.6" stroke-width="${f(W * 0.0045)}" stroke-linejoin="round"/>`;
}

function speed(c: PatternCtx) {
  const { W, H, idp } = c;
  const R = rng(c.seed + PLACEMENT_SALT[c.placement]);
  const out: string[] = [];
  const count = isSleeve(c.placement) ? 14 : 34;
  for (let i = 0; i < count; i++) {
    const y = H * (0.15 + R() ** 0.7 * 0.95);
    const len = W * (0.25 + R() * 0.6) * c.scale;
    const th = W * (0.006 + R() ** 2 * 0.035) * c.scale;
    // streaks hug the sides so the chest numbers stay clean
    const fromLeft = R() < 0.5;
    const x = fromLeft ? -W * 0.1 - R() * W * 0.2 : W * 1.1 - len + R() * W * 0.2;
    const col = R() < 0.72 ? c.c1 : c.c2;
    out.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(len)}" height="${f(th)}" rx="${f(th / 2)}" fill="${col}" fill-opacity="${(0.45 + R() * 0.55).toFixed(2)}"/>`);
  }
  return `<defs><linearGradient id="${idp}sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0.2" stop-color="${c.primary}"/><stop offset="1" stop-color="${mix(c.primary, "#000000", 0.3)}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#${idp}sg)"/><g transform="rotate(-20 ${f(W / 2)} ${f(H / 2)})">${out.join("")}</g>`;
}

function hex(c: PatternCtx) {
  const { W, H } = c;
  const R = rng(c.seed + PLACEMENT_SALT[c.placement]);
  const r = W * 0.045 * c.scale;
  const hw = Math.sqrt(3) * r;
  const outlines: string[] = [];
  const fills: string[] = [];
  const hexPath = (cx: number, cy: number, k: number) =>
    poly([0, 1, 2, 3, 4, 5].map((i) => {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      return [cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k] as [number, number];
    }));
  for (let row = 0, cy = 0; cy < H + r; row++, cy += r * 1.5) {
    for (let cx = row % 2 ? hw / 2 : 0; cx < W + hw; cx += hw) {
      const t = clamp((cy / H - 0.25) / 0.7);
      if (t <= 0.02) continue;
      if (R() < t * 0.35) fills.push(`<path d="${hexPath(cx, cy, 0.86)}" fill-opacity="${(0.35 + t * 0.5).toFixed(2)}"/>`);
      else outlines.push(`<path d="${hexPath(cx, cy, 0.9)}" stroke-opacity="${(t * 0.8).toFixed(2)}"/>`);
    }
  }
  return `<g fill="none" stroke="${c.c1}" stroke-width="${f(r * 0.1)}">${outlines.join("")}</g><g fill="${c.c2}">${fills.join("")}</g>`;
}

function tiger(c: PatternCtx) {
  const { W, H } = c;
  const R = rng(c.seed + PLACEMENT_SALT[c.placement]);
  const out: string[] = [];
  const n = isSleeve(c.placement) ? 6 : 10;
  for (const side of [0, 1]) {
    for (let i = 0; i < n; i++) {
      const y0 = H * ((i + 0.3 + R() * 0.4) / n);
      const len = W * (0.18 + R() * 0.28) * c.scale;
      const th = H * (0.018 + R() * 0.03) * c.scale;
      const bend = (R() - 0.5) * th * 3;
      const dir = side ? -1 : 1;
      const x0 = side ? W * 1.02 : -W * 0.02;
      const tipX = x0 + dir * len, tipY = y0 + (R() - 0.4) * th * 2;
      const midX = x0 + dir * len * 0.5;
      out.push(
        `<path d="M${f(x0)} ${f(y0 - th / 2)}Q${f(midX)} ${f(y0 - th * 0.7 + bend)} ${f(tipX)} ${f(tipY)}Q${f(midX)} ${f(y0 + th * 0.5 + bend)} ${f(x0)} ${f(y0 + th / 2)}Z"/>`
      );
      // occasional forked stroke
      if (R() < 0.35) {
        const fx = x0 + dir * len * 0.35, fy = y0 + th * 0.4;
        out.push(`<path d="M${f(fx)} ${f(fy - th * 0.2)}Q${f(fx + dir * len * 0.2)} ${f(fy + th * 0.5)} ${f(fx + dir * len * 0.45)} ${f(fy + th * 1.4)}Q${f(fx + dir * len * 0.15)} ${f(fy + th * 0.9)} ${f(fx)} ${f(fy + th * 0.4)}Z"/>`);
      }
    }
  }
  return `<g fill="${c.c1}">${out.join("")}</g>`;
}

function waves(c: PatternCtx) {
  const { W, H } = c;
  const R = rng(c.seed + 3);
  const sleeve = isSleeve(c.placement);
  const ribbons = sleeve
    ? [{ y: 0.62, th: 0.1, col: c.c1 }, { y: 0.76, th: 0.04, col: c.c2 }]
    : [{ y: 0.6, th: 0.07, col: c.c1 }, { y: 0.71, th: 0.025, col: c.c2 }, { y: 0.82, th: 0.09, col: tone(c.primary, 0.18) }, { y: 0.08, th: 0.03, col: c.c2 }];
  const phase = R() * Math.PI * 2;
  const out = ribbons.map(({ y, th, col }, i) => {
    const top: [number, number][] = [];
    const bot: [number, number][] = [];
    for (let s = 0; s <= 48; s++) {
      const x = (s / 48) * W;
      const wave = Math.sin((x / W) * Math.PI * 2 * 0.9 * (1 / c.scale) + phase + i * 0.7) * H * 0.05;
      const tilt = (x / W - 0.5) * H * -0.08;
      const thick = H * th * (0.6 + 0.4 * Math.sin((x / W) * Math.PI));
      top.push([x, H * y + wave + tilt - thick / 2]);
      bot.unshift([x, H * y + wave + tilt + thick / 2]);
    }
    return `<path d="${poly([...top, ...bot])}" fill="${col}"/>`;
  });
  return out.join("");
}

function fade(c: PatternCtx) {
  const { W, H, idp } = c;
  return `<defs><linearGradient id="${idp}fd" x1="0" y1="0" x2="0.6" y2="1"><stop offset="0.25" stop-color="${c.primary}"/><stop offset="0.75" stop-color="${mix(c.primary, c.c1, 0.6)}"/><stop offset="1" stop-color="${c.c1}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#${idp}fd)"/>`;
}

export const PROCEDURAL: Record<string, (c: PatternCtx) => string> = {
  sash, chevron, halftone, camo, shards, lightning, topo, speed, hex, tiger, waves, fade,
};

// Fine fabric-style overlays laid over the whole panel.
export function texture(kind: string, W: number, H: number, base: string, idp: string): string {
  if (kind === "mesh") {
    const s = W / 160;
    return `<defs><pattern id="${idp}mesh" width="${f(s)}" height="${f(s)}" patternUnits="userSpaceOnUse"><circle cx="${f(s / 2)}" cy="${f(s / 2)}" r="${f(s * 0.22)}" fill="${tone(base, 0.25)}" fill-opacity="0.35"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#${idp}mesh)"/>`;
  }
  if (kind === "carbon") {
    const s = W / 130;
    const a = tone(base, 0.12);
    return `<defs><pattern id="${idp}carb" width="${f(s)}" height="${f(s)}" patternUnits="userSpaceOnUse"><rect width="${f(s / 2)}" height="${f(s / 2)}" fill="${a}" fill-opacity="0.25"/><rect x="${f(s / 2)}" y="${f(s / 2)}" width="${f(s / 2)}" height="${f(s / 2)}" fill="${a}" fill-opacity="0.25"/><path d="M0 0L${f(s / 2)} ${f(s / 2)}M${f(s / 2)} ${f(s / 2)}L${f(s)} ${f(s)}" stroke="#000" stroke-opacity="0.12" stroke-width="${f(s / 12)}"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#${idp}carb)"/>`;
  }
  return "";
}
