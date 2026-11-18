// Prints seam warnings for every jersey's starting design (they should all be
// clean), and checks that body graphics meet front to back at the side seams.
// npx tsx --conditions=react-server scripts/seam-check.ts
import { PRODUCTS } from "../src/lib/catalog";
import { defaultSpec, DesignSpecSchema } from "../src/lib/design-spec";
import { seamRisks } from "../src/lib/seams";
import { graphicGeometry, type Graphic } from "../src/lib/graphics";
import { pieceFor } from "../src/lib/garments";
import { panelLayout } from "../src/lib/render";

let bad = 0;
for (const p of PRODUCTS) {
  const base = defaultSpec(p.sport, p.key);
  const spec = DesignSpecSchema.parse({
    ...base,
    wordmark: { ...base.wordmark, show: true, text: "WILDCATS" },
    logo: { ...base.logo, url: "https://example.com/logo.png", source: "upload" },
    lettering: { ...base.lettering, showName: true },
  });
  const risks = seamRisks(spec, { name: "MACKENZIE", number: "88" });
  if (risks.length) bad++;
  console.log(p.key.padEnd(22), risks.length ? risks.map((r) => `${r.placement}:${r.id}:${r.where}`).join(", ") : "clean");
}

// names and numbers dragged onto a seam step off it
for (const [key, sport, field, dy] of [
  ["football-american", "football", "nameOffsetY", -0.3],
  ["football-boxy", "football", "numberOffsetY", -0.1],
  ["football-boxy", "football", "nameOffsetY", 0.12],
] as const) {
  const base = defaultSpec(sport, key);
  const spec = DesignSpecSchema.parse({ ...base, lettering: { ...base.lettering, showName: true, [field]: dy } });
  const risks = seamRisks(spec, { name: "MACKENZIE", number: "88" }).filter((r) => r.id === "name" || r.id === "number");
  const lp = panelLayout(spec, "back");
  console.log(`${key} ${field}=${dy}:`.padEnd(40), risks.length ? `RISK ${risks.map((r) => r.where).join(",")}` : "kept off the seam", `name y ${lp.name?.y.toFixed(3)} number y ${lp.number?.y.toFixed(3)}`);
  if (risks.length) bad++;
}

// body graphics meet at the side seams: compare edge heights (px above the
// hem) where the front and back pieces are sewn together
const tests: Graphic[] = [
  { id: "d1", kind: "panel", hidden: false, edge: "diagonal", side: "below", y: 0.55, depth: 0.3, points: [], color: "secondary", trim: [], front: true, back: "same", sleeves: false, sleeveY: 0.6 },
  { id: "d2", kind: "panel", hidden: false, edge: "diagonal", side: "below", y: 0.55, depth: 0.3, points: [], color: "secondary", trim: [], front: true, back: "straight", sleeves: false, sleeveY: 0.6 },
  { id: "c1", kind: "panel", hidden: false, edge: "chevron", side: "below", y: 0.45, depth: -0.14, points: [], color: "secondary", trim: [], front: true, back: "straight", sleeves: false, sleeveY: 0.6 },
  { id: "s1", kind: "panel", hidden: false, edge: "star_point", side: "below", y: 0.5, depth: 0.24, points: [], color: "secondary", trim: [], front: true, back: "same", sleeves: false, sleeveY: 0.6 },
  { id: "k1", kind: "panel", hidden: false, edge: "custom", side: "below", y: 0.5, depth: 0, points: [[0, 0.4], [0.3, 0.6], [1, 0.7]], color: "secondary", trim: [], front: true, back: "straight", sleeves: false, sleeveY: 0.6 },
];
let worst = 0;
for (const p of PRODUCTS) {
  if (!pieceFor(p.key, "back").hem) continue;
  for (const g of tests) {
    const spec = DesignSpecSchema.parse({ ...defaultSpec(p.sport, p.key), graphics: [g] });
    const F = pieceFor(p.key, "front");
    const B = pieceFor(p.key, "back");
    const gf = graphicGeometry(spec, g, "front", F.dims.width, F.dims.height)!.guide!;
    const gb = graphicGeometry(spec, g, "back", B.dims.width, B.dims.height)!.guide!;
    const hf = (y: number) => F.hem! * F.dims.height - y;
    const hb = (y: number) => B.hem! * B.dims.height - y;
    // front left side = wearer's right = back's right side
    const d = Math.max(Math.abs(hf(gf[0].y) - hb(gb[gb.length - 1].y)), Math.abs(hf(gf[gf.length - 1].y) - hb(gb[0].y)));
    worst = Math.max(worst, d);
    if (d > 2) {
      bad++;
      console.log("side seams don't meet:", p.key, g.id, d.toFixed(1), "px");
    }
  }
}
console.log(`side seams: worst mismatch ${worst.toFixed(1)} px`);
process.exit(bad ? 1 : 0);
