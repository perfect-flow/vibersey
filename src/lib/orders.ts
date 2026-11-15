import "server-only";
import { supabaseAdmin } from "./supabase/admin";
import { getDesign } from "./designs";
import { getProduct, createOrder, type Recipient } from "./printful";
import { buildPrintFiles } from "./printfile";
import { cleanPlayer } from "./design-spec";

export type OrderItem = {
  design_id: string;
  sport: string;
  product_key: string; // may be the youth version of the design's product
  variant_id: number;
  size: string;
  name: string;
  number: string;
  quantity: number;
  unit_price_cents: number;
  unit_cost_cents: number;
  roster_entry_id?: string | null;
  // set for orders placed through a team's share link
  new_roster_entry?: { team_id: string; email: string | null } | null;
  files?: { type: string; url: string }[];
};

// Render print files and submit a paid order to Printful. Safe to re-run:
// it does nothing once a Printful order exists.
export async function fulfillOrder(orderId: string) {
  const db = supabaseAdmin();
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).single();
  if (!order || order.printful_order_id || !["paid", "failed"].includes(order.status)) return;

  try {
    const items = order.items as OrderItem[];
    const designCache = new Map<string, Awaited<ReturnType<typeof getDesign>>>();
    for (const item of items) {
      if (item.files?.length) continue;
      if (!designCache.has(item.design_id)) designCache.set(item.design_id, await getDesign(item.design_id));
      const design = designCache.get(item.design_id);
      if (!design) throw new Error(`Design ${item.design_id} missing`);
      const product = await getProduct(item.product_key);
      item.files = await buildPrintFiles(design.spec, cleanPlayer({ name: item.name, number: item.number }), product);
      // save progress so a retry doesn't re-render finished items
      await db.from("orders").update({ items }).eq("id", orderId);
    }

    const a = order.shipping_address as Recipient;
    const pfOrder = await createOrder({
      externalId: order.id.replace(/-/g, "").slice(0, 32),
      recipient: a,
      items: items.map((i) => ({
        variant_id: i.variant_id,
        quantity: i.quantity,
        retail_price: (i.unit_price_cents / 100).toFixed(2),
        name: [i.name, i.number && `#${i.number}`].filter(Boolean).join(" ") || "Vibersey jersey",
        files: i.files!,
      })),
    });
    await db
      .from("orders")
      .update({ status: "submitted", printful_order_id: pfOrder.id, error: null, updated_at: new Date().toISOString() })
      .eq("id", orderId);
  } catch (e) {
    console.error("fulfillOrder", orderId, e);
    await db
      .from("orders")
      .update({ status: "failed", error: (e as Error).message.slice(0, 1000), updated_at: new Date().toISOString() })
      .eq("id", orderId);
  }
}
