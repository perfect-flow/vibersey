// Renders tie-dye, camo, a 3-color gradient and the collar on a few jerseys
// for a visual check: npx tsx --conditions=react-server scripts/render-pattern-sample.ts out-dir
import fs from "fs";
import path from "path";
import { Resvg } from "@resvg/resvg-js";
import { defaultSpec, FONTS, type DesignSpec } from "../src/lib/design-spec";
import { renderPanelSVG, placementsFor } from "../src/lib/render";
import { pieceFor } from "../src/lib/garments";

const out = process.argv[2] ?? "tmp-render";
fs.mkdirSync(out, { recursive: true });
const fontFiles = Object.values(FONTS).map((f) => path.join("public/fonts", f.file));
const cases: [string, DesignSpec][] = [];
const td = defaultSpec("basketball");
td.colors = { primary: "#7B2FBE", secondary: "#FF3E9A", accent: "#FFC93C", text: "#FFFFFF", outline: "#1B1B3A" };
td.pattern = { ...td.pattern, style: "tie_dye", colors: ["primary", "secondary", "accent", "#2EC4F1"] };
td.graphics = [{ id: "hem", kind: "stripes", hidden: false, area: "body", y: 0.86, front: true, back: true, bands: [{ color: "outline", width: 0.03, gap: 0.01 }, { color: "text", width: 0.015, gap: 0 }] }];
td.collar = { color: "outline" };
cases.push(["tiedye", td]);
const cm = defaultSpec("soccer");
cm.colors = { primary: "#4B5320", secondary: "#2E3B1F", accent: "#8A7F5A", text: "#FFFFFF", outline: "#111111" };
cm.pattern = { ...cm.pattern, style: "camo", colors: [] };
cases.push(["camo", cm]);
const gr = defaultSpec("hockey");
gr.pattern = { ...gr.pattern, style: "gradient", colors: ["#0B1F3A", "#1E6FD9", "#7FE7FF"] };
gr.graphics = [{ id: "yoke", kind: "yoke", hidden: false, color: "secondary", depth: 0.14, shape: "straight", trim: [{ color: "accent", width: 0.014 }, { color: "text", width: 0.01 }], sleeves: true }];
cases.push(["gradient", gr]);
const fb = defaultSpec("football", "football-boxy");
cases.push(["boxy", fb]);
for (const [name, spec] of cases) {
  for (const pl of placementsFor(spec)) {
    const d = pieceFor(spec.product, pl).dims;
    const svg = renderPanelSVG(spec, pl, { width: d.width / 8, height: d.height / 8, player: { name: "JONES", number: "23" }, guides: true });
    fs.writeFileSync(path.join(out, `${name}-${pl}.png`), new Resvg(svg, { font: { fontFiles, loadSystemFonts: false } }).render().asPng());
  }
}
console.log("ok");
