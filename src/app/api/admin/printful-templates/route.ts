import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { getProduct, pf } from "@/lib/printful";

export const maxDuration = 60;

// Read-only: Printful's layout templates and print-file info for one jersey,
// so the preview and print layout can be matched to the real garment.
// GET /api/admin/printful-templates?secret=...&key=hockey-recycled
export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const product = await getProduct(key);
  if (!product) return NextResponse.json({ error: `Unknown or unsynced product "${key}"` }, { status: 404 });
  const id = product.printful_product_id;
  const [templates, printfiles] = await Promise.all([
    pf(`/mockup-generator/templates/${id}`).catch((e) => ({ error: (e as Error).message })),
    pf(`/mockup-generator/printfiles/${id}`).catch((e) => ({ error: (e as Error).message })),
  ]);
  return NextResponse.json({ key, printful_product_id: id, stored_printfiles: product.printfiles, templates, printfiles });
}
