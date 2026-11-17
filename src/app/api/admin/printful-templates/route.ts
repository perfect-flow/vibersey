import { NextResponse } from "next/server";
import sharp from "sharp";
import { isAdmin } from "@/lib/admin";
import { getProduct, pf } from "@/lib/printful";

export const maxDuration = 60;

type Tpl = {
  template_id: number;
  image_url: string;
  background_url: string | null;
  template_width: number;
  template_height: number;
  print_area_width: number;
  print_area_height: number;
  print_area_top: number;
  print_area_left: number;
};
type Templates = { variant_mapping: { variant_id: number; templates: { placement: string; template_id: number }[] }[]; templates: Tpl[] };

// Read-only: Printful's layout templates for one jersey, so the preview and
// print layout can be matched to the real garment.
// GET /api/admin/printful-templates?secret=...&key=hockey-recycled[&images=1]
// images=1 adds each template image as a small base64 PNG plus the box its
// drawing covers (template pixels).
export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  const withImages = url.searchParams.get("images") === "1";
  const product = await getProduct(key);
  if (!product) return NextResponse.json({ error: `Unknown or unsynced product "${key}"` }, { status: 404 });
  const id = product.printful_product_id;
  const [t, info] = await Promise.all([
    pf<Templates>(`/mockup-generator/templates/${id}`),
    pf<{ available_placements: Record<string, string>; option_groups: string[] }>(`/mockup-generator/printfiles/${id}`),
  ]);
  const first = t.variant_mapping[0]?.templates ?? [];
  const placements = await Promise.all(
    first.map(async ({ placement, template_id }) => {
      const tpl = t.templates.find((x) => x.template_id === template_id)!;
      const out: Record<string, unknown> = { placement, ...tpl };
      if (withImages && tpl?.image_url) {
        try {
          const buf = Buffer.from(await (await fetch(tpl.image_url)).arrayBuffer());
          const meta = await sharp(buf).metadata();
          out.image_size = [meta.width, meta.height];
          out.image_has_alpha = meta.hasAlpha;
          out.preview = `data:image/png;base64,${(await sharp(buf).resize(360, 360, { fit: "inside" }).png().toBuffer()).toString("base64")}`;
        } catch (e) {
          out.preview_error = (e as Error).message;
        }
      }
      return out;
    })
  );
  return NextResponse.json({
    key,
    printful_product_id: id,
    stored_printfiles: product.printfiles,
    available_placements: info.available_placements,
    option_groups: info.option_groups,
    placements,
  });
}
