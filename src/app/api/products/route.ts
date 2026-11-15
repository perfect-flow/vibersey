import { NextResponse } from "next/server";
import { PRODUCTS, STANDARDS } from "@/lib/catalog";
import { priceCents } from "@/lib/pricing";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Public catalog: every jersey with its sizes and retail prices (cost + $20).
export async function GET() {
  const { data } = await supabaseAdmin().from("products").select("*");
  const rows = new Map((data ?? []).map((r) => [r.key, r]));
  return NextResponse.json({
    products: PRODUCTS.map((def) => {
      const r = rows.get(def.key);
      const all = ((r?.variants ?? []) as { size: string; cost: number }[]).map((v) => ({ size: v.size, price: priceCents(v.cost) }));
      // one entry per size (variants repeat per color); keep the highest price to be safe
      const bySize = new Map<string, { size: string; price: number }>();
      for (const v of all) if ((bySize.get(v.size)?.price ?? -1) < v.price) bySize.set(v.size, v);
      const sizes = [...bySize.values()];
      return {
        key: def.key,
        sport: def.sport,
        sportLabel: STANDARDS[def.sport].label,
        label: def.label,
        audience: def.audience,
        youthKey: def.youthKey ?? null,
        title: r?.title ?? def.title,
        image: r?.mockup_image ?? null,
        sizes,
        fromPrice: sizes.length ? Math.min(...sizes.map((s) => s.price)) : null,
        synced: !!r,
      };
    }),
  });
}
