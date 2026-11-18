import { NextResponse } from "next/server";
import { productByKey } from "@/lib/catalog";
import { productDetails } from "@/lib/product-details";

export const maxDuration = 30;

// Product facts, photos and size guide for the "Details" pop-up (public).
export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const def = productByKey(key);
  if (!def) return NextResponse.json({ error: "Unknown jersey" }, { status: 404 });
  try {
    const main = await productDetails(def.key);
    const youth = def.youthKey ? await productDetails(def.youthKey).catch(() => null) : null;
    return NextResponse.json(
      { details: main, youth },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } }
    );
  } catch (e) {
    console.error("product details failed", key, e);
    return NextResponse.json({ error: "Product details aren't available right now." }, { status: 502 });
  }
}
