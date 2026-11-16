// Renders garment previews (front + back, side by side) for a set of sample
// designs to PNG, for eyeballing design changes: npx tsx scripts/render-previews.tsx [outDir]
import fs from "fs";
import path from "path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Resvg } from "@resvg/resvg-js";
import { JerseyPreview } from "../src/components/JerseyPreview";
import { FONTS, type DesignSpec } from "../src/lib/design-spec";
import { SAMPLES, GALLERY } from "./preview-samples";

const out = process.argv[2] ?? "tmp-previews";
fs.mkdirSync(out, { recursive: true });
const fontFiles = Object.values(FONTS).map((f) => path.join("public/fonts", f.file));

// sample logo: a transparent PNG emblem, inlined like the print renderer does
const logoPath = path.join(__dirname, "sample-logo.png");
const logoData = `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`;
const aiLogoData = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, "sample-ai-logo.png")).toString("base64")}`;

for (const [name, spec] of Object.entries(process.env.GALLERY ? GALLERY : SAMPLES) as [string, DesignSpec][]) {
  if (spec.logo.url === "sample") spec.logo.url = logoData;
  if (spec.logo.url === "sample-ai") spec.logo.url = aiLogoData;
  const views = (["front", "back"] as const).map((v) =>
    renderToStaticMarkup(createElement(JerseyPreview, { spec, player: { name: "JONES", number: "23" }, view: v }))
  );
  const inner = views
    .map((s, i) => s.replace(/^<svg([^>]*)>/, `<svg x="${i * 600}" y="0" width="600" height="660"$1>`))
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="660" viewBox="0 0 1200 660"><rect width="1200" height="660" fill="#F2F3F5"/>${inner}</svg>`;
  const png = new Resvg(svg, { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Graduate" }, fitTo: { mode: "width", value: 1200 } })
    .render()
    .asPng();
  fs.writeFileSync(path.join(out, `${name}.png`), png);
}
console.log("ok", out);
