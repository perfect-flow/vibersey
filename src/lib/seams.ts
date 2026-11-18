// Seam check: is any name, number, team name or logo close enough to a cut
// edge or seam that part of it could be sewn into the seam or cut off?
//
// Each print panel is cut out along the piece outline (garments.ts) and the
// outer half inch of every edge disappears into a seam. Pieces cut in two
// (the boxy football front and back) also have a seam across the chest, and
// jerseys with a separate shoulder piece (hockey, American football) are
// sewn to it along the top edge of the body.

import { placementsFor, selectables } from "./render";
import type { Placement } from "./catalog";
import type { DesignSpec, Player } from "./design-spec";
import { DPI, SEAM_ALLOWANCE_IN, distToEdges, partAt, pieceFor, piecePolys, piecePx, rectSamples, type Pt } from "./garments";
import { hasYokePiece } from "./graphics";

export type SeamRisk = {
  id: string; // selectable id ("number", "name", "wordmark", "logo", "patch:...")
  placement: Placement;
  where: "chest" | "shoulder" | "edge";
  message: string;
};

const LABELS: Record<string, string> = {
  number: "The number",
  name: "The player name",
  wordmark: "The team name",
  logo: "The logo",
  "patch:alternate": "The shoulder patch",
  "patch:captain": "The captain letter",
};

const PANEL_LABELS: Partial<Record<Placement, string>> = {
  front: "on the front",
  back: "on the back",
  sleeve_left: "on the left sleeve",
  sleeve_right: "on the right sleeve",
  yoke: "on the shoulders",
};

// Text hit boxes are padded for easy clicking; check the letters themselves.
const TEXT_IDS = new Set(["number", "name", "wordmark"]);

export function seamRisks(spec: DesignSpec, player: Player): SeamRisk[] {
  const out: SeamRisk[] = [];
  const margin = SEAM_ALLOWANCE_IN * DPI;
  for (const pl of placementsFor(spec)) {
    const piece = pieceFor(spec.product, pl);
    const polys = piecePolys(piece);
    const b = piecePx(piece);
    const { width: W, height: H } = piece.dims;
    for (const s of selectables(spec, pl, player, W, H)) {
      if (!s.rect || !(s.id in LABELS)) continue;
      let r = s.rect;
      if (TEXT_IDS.has(s.id)) {
        const w = r.w / 1.15;
        const h = r.h / 1.5;
        r = { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
      }
      const pts = rectSamples(r);
      const owner = (p: Pt) => partAt(polys, p);
      const parts = new Set(pts.map(owner));
      let where: SeamRisk["where"] | null = null;
      if (polys.length > 1 && (parts.size > 1 || parts.has(-1)) && pts.some((p) => owner(p) === -1 && p.x > b.x + 0.1 * b.w && p.x < b.x + 0.9 * b.w && p.y > b.y + 0.15 * b.h && p.y < b.y + 0.6 * b.h)) {
        where = "chest";
      } else {
        const bad = pts.filter((p) => {
          const k = owner(p);
          return k < 0 || distToEdges(p, polys[k]) < margin;
        });
        if (bad.length) {
          const nearTop = bad.every((p) => p.y < b.y + 0.12 * b.h);
          where = nearTop && (pl === "front" || pl === "back") && hasYokePiece(spec.product) ? "shoulder" : "edge";
        }
      }
      if (!where) continue;
      const what = LABELS[s.id];
      const panel = PANEL_LABELS[pl] ?? "";
      const message =
        where === "chest"
          ? `${what} ${panel} crosses the seam across the chest, so it would be split when the jersey is sewn.`
          : where === "shoulder"
            ? `${what} ${panel} runs into the shoulder seam and would be partly sewn into it.`
            : `${what} ${panel} is too close to a seam or edge, so part of it could be cut off when the jersey is sewn.`;
      if (!out.some((o) => o.id === s.id && o.placement === pl)) out.push({ id: s.id, placement: pl, where, message });
    }
  }
  return out;
}
