import "server-only";
import path from "path";
import { Resvg } from "@resvg/resvg-js";
import { DEFAULT_PRINTFILE, type Placement } from "./catalog";
import { FONTS, type DesignSpec, type Player } from "./design-spec";
import { renderPanelSVG, placementsFor } from "./render";
import { uploadPublic } from "./images";
import type { ProductRow } from "./printful";

const FONT_DIR = path.join(process.cwd(), "public", "fonts");
const fontFiles = Object.values(FONTS).map((f) => path.join(FONT_DIR, f.file));

async function inlineImages(spec: DesignSpec) {
  const urls = [spec.pattern.style === "artwork" ? spec.pattern.artworkUrl : null, spec.logo.url].filter(
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

// Render every print panel for one player and upload them. Returns the file
// list in the shape Printful's order API expects.
export async function buildPrintFiles(spec: DesignSpec, player: Player, product: ProductRow | null) {
  const images = await inlineImages(spec);
  const files: { type: Placement; url: string }[] = [];
  for (const placement of placementsFor(spec)) {
    const dims = product?.printfiles?.[placement] ?? DEFAULT_PRINTFILE;
    const svg = renderPanelSVG(spec, placement, {
      width: dims.width,
      height: dims.height,
      player,
      resolveImage: (u) => images.get(u),
    });
    const png = renderPng(svg);
    files.push({ type: placement, url: await uploadPublic("printfiles", Buffer.from(png), "image/png", `${spec.sport}/`) });
  }
  return files;
}
