// Renders a star-point hockey design's print panels for a visual check.
import fs from "fs";
import path from "path";
import { Resvg } from "@resvg/resvg-js";
import { defaultSpec, FONTS } from "../src/lib/design-spec";
import { renderPanelSVG, placementsFor } from "../src/lib/render";

const out = process.argv[2] ?? "tmp-render";
fs.mkdirSync(out, { recursive: true });
const fontFiles = Object.values(FONTS).map((f) => path.join("public/fonts", f.file));
const spec = defaultSpec("hockey");
spec.colors = { primary: "#123A75", secondary: "#0A1A33", accent: "#A7B1BC", text: "#FFFFFF", outline: "#A7B1BC" };
spec.wordmark = { ...spec.wordmark, show: true, text: "NORTHSTAR" };
spec.graphics = [
  { id: "yoke", kind: "yoke", hidden: false, color: "primary", depth: 0.14, shape: "straight", trim: [], sleeves: true },
  { id: "lower", kind: "panel", hidden: false, edge: "custom", side: "below", y: 0.48, depth: 0.14, points: [[0, 0.38], [0.2, 0.62], [0.5, 0.48], [0.8, 0.62], [1, 0.38]],
    color: "secondary", trim: [{ color: "accent", width: 0.022 }, { color: "text", width: 0.012 }], front: true, back: "straight", sleeves: true, sleeveY: 0.6 },
];
for (const pl of placementsFor(spec)) {
  const svg = renderPanelSVG(spec, pl, { width: 555, height: 630, player: { name: "JONES", number: "23" }, guides: true });
  fs.writeFileSync(path.join(out, `${pl}.png`), new Resvg(svg, { font: { fontFiles, loadSystemFonts: false } }).render().asPng());
}
console.log("ok");
