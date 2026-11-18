import "server-only";
import path from "path";
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_PRINTFILE, type Placement } from "./catalog";
import { FONTS, type DesignSpec, type Player } from "./design-spec";
import { renderPanelSVG, placementsFor } from "./render";
import { pieceFor } from "./garments";
import { uploadPublic } from "./images";
import type { ProductRow } from "./printful";

const FONT_DIR = path.join(process.cwd(), "public", "fonts");
const fontFiles = Object.values(FONTS).map((f) => path.join(FONT_DIR, f.file));

async function inlineImages(spec: DesignSpec) {
  const alt = spec.patches?.alternate;
  const urls = [spec.pattern.style === "artwork" ? spec.pattern.artworkUrl : null, spec.logo.url, alt?.show ? alt.url : null].filter(
    (u): u is string => !!u
  );
  const map = new Map<string, string>();
  await Promise.all(
    urls.map(async (u) => {
      const r = await fetch(u);
      if (!r.ok) throw new Error(`Could not fetch artwork ${u}`);
      const mime = r.headers.get("content-type") ?? "image/png";
      map.set(u, `data:${mime};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`);
    })
  );
  return map;
}

export function renderPng(svg: string) {
  const r = new Resvg(svg, {
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: "Graduate" },
    fitTo: { mode: "original" },
  });
  return r.render().asPng();
}

// Render every print panel for one player. scale < 1 renders smaller files
// (for mockup previews); dims always report the real print-file size.
export async function renderPanels(spec: DesignSpec, player: Player, product: ProductRow | null, scale = 1) {
  const images = await inlineImages(spec);
  return placementsFor(spec).map((placement) => {
    const dims = product?.printfiles?.[placement] ?? pieceFor(spec.product, placement, DEFAULT_PRINTFILE).dims;
    const svg = renderPanelSVG(spec, placement, {
      width: Math.round(dims.width * scale),
      height: Math.round(dims.height * scale),
      player,
      resolveImage: (u) => images.get(u),
    });
    return { placement, dims, png: Buffer.from(renderPng(svg)) };
  });
}

// Render every print panel for one player and upload them. Returns the file
// list in the shape Printful's order API expects.
export async function buildPrintFiles(spec: DesignSpec, player: Player, product: ProductRow | null) {
  const files: { type: Placement; url: string }[] = [];
  for (const panel of await renderPanels(spec, player, product)) {
    files.push({ type: panel.placement, url: await uploadPublic("printfiles", panel.png, "image/png", `${spec.sport}/`) });
  }
  return files;
}
