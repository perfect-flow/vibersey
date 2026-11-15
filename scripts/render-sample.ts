// Renders sample print panels to ./tmp-render for a quick visual check.
import fs from "fs";
import path from "path";
import { Resvg } from "@resvg/resvg-js";
import { SPORTS } from "../src/lib/catalog";
import { defaultSpec, FONTS } from "../src/lib/design-spec";
import { renderPanelSVG, placementsFor } from "../src/lib/render";

const out = process.argv[2] ?? "tmp-render";
fs.mkdirSync(out, { recursive: true });
const fontFiles = Object.values(FONTS).map((f) => path.join("public/fonts", f.file));
for (const sport of SPORTS) {
  const spec = defaultSpec(sport);
  spec.wordmark.text = "HAWKS";
  for (const pl of placementsFor(spec)) {
    const svg = renderPanelSVG(spec, pl, { width: 450, height: 540, player: { name: "JONES", number: "23" } });
    const png = new Resvg(svg, { font: { fontFiles, loadSystemFonts: false } }).render().asPng();
    fs.writeFileSync(path.join(out, `${sport}-${pl}.png`), png);
  }
}
console.log("ok");
