import { NextResponse, after } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fulfillOrder, type OrderItem } from "@/lib/orders";

export const maxDuration = 300;

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig ?? "", env.stripeWebhookSecret());
  } catch {
    return NextResponse.json({ error: "Bad signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.order_id;
    if (!orderId) return NextResponse.json({ ok: true });
    const db = supabaseAdmin();
    const { data: order } = await db.from("orders").select("*").eq("id", orderId).single();
    if (order && order.status === "pending") {
      const ship = session.collected_information?.shipping_details ?? null;
      const addr = ship?.address;
      const recipient = {
        name: ship?.name ?? session.customer_details?.name ?? "",
        address1: addr?.line1 ?? "",
        address2: addr?.line2 ?? null,
        city: addr?.city ?? "",
        state_code: addr?.state ?? null,
        country_code: addr?.country ?? "US",
        zip: addr?.postal_code ?? "",
        email: session.customer_details?.email ?? null,
        phone: session.customer_details?.phone ?? null,
      };

      // link roster entries to this order (and create ones from share-link orders)
      const items = order.items as OrderItem[];
      // one roster entry per player even when they bought several kits
      const created = new Map<string, string | null>();
      for (const item of items) {
        const who = `${item.name}|${item.number}|${item.size}|${item.quantity}`;
        if (item.new_roster_entry && created.has(who)) {
          item.roster_entry_id = created.get(who) ?? null;
        } else if (item.new_roster_entry) {
          const { data: entry } = await db
            .from("roster_entries")
            .insert({
              team_id: item.new_roster_entry.team_id,
              player_name: item.name,
              number: item.number,
              size: item.size,
              quantity: item.quantity,
              email: item.new_roster_entry.email ?? recipient.email,
              source: "link",
              order_id: orderId,
            })
            .select("id")
            .single();
          item.roster_entry_id = entry?.id ?? null;
          created.set(who, item.roster_entry_id ?? null);
        } else if (item.roster_entry_id) {
          await db.from("roster_entries").update({ order_id: orderId }).eq("id", item.roster_entry_id);
        }
      }

      await db
        .from("orders")
        .update({
          status: "paid",
          items,
          email: order.email ?? recipient.email,
          shipping_address: recipient,
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId);

      // rendering print files can take a while; answer Stripe first
      after(() => fulfillOrder(orderId));
    }
  }
  return NextResponse.json({ ok: true });
}
