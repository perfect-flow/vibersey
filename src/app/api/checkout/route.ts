import { NextResponse } from "next/server";
import { z } from "zod";
import { getActor } from "@/lib/usage";
import { getDesign, canEdit } from "@/lib/designs";
import { getOrderableProducts } from "@/lib/printful";
import { getTeamBySlug, getTeamForOwner, RosterEntryInput, cleanEntry } from "@/lib/teams";
import { priceCents, variantForSize } from "@/lib/pricing";
import { cleanPlayer } from "@/lib/design-spec";
import { STANDARDS } from "@/lib/catalog";
import { stripe } from "@/lib/stripe";
import { env } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { OrderItem } from "@/lib/orders";

type OrderableVariant = { id: number; size: string; color: string; cost: number };

const Line = z.object({
  size: z.string().min(1),
  name: z.string().max(16).default(""),
  number: z.string().max(3).default(""),
  quantity: z.coerce.number().int().min(1).max(50).default(1),
});

const Body = z.discriminatedUnion("mode", [
  // a customer buying their own design
  z.object({ mode: z.literal("design"), designId: z.string().uuid(), lines: z.array(Line).min(1).max(50) }),
  // a manager buying the whole roster (or selected players)
  z.object({ mode: z.literal("team"), teamId: z.string().uuid(), entryIds: z.array(z.string().uuid()).optional() }),
  // a team member ordering through the share link
  z.object({ mode: z.literal("member"), slug: z.string().min(4), entry: RosterEntryInput }),
]);

const COUNTRIES = ["US", "CA", "GB", "AU", "NZ", "IE", "DE", "FR", "ES", "IT", "NL", "BE", "SE", "DK", "NO", "FI", "AT", "CH", "PT", "PL", "MX", "JP"] as const;

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid order" }, { status: 400 });
  const body = parsed.data;
  const actor = await getActor();
  const db = supabaseAdmin();

  let designId: string;
  let teamId: string | null = null;
  let cancelPath = "/";
  let pending: Omit<OrderItem, "variant_id" | "unit_price_cents" | "unit_cost_cents" | "sport" | "design_id" | "product_key">[] = [];

  if (body.mode === "design") {
    const d = await getDesign(body.designId);
    if (!d || !canEdit(d, actor)) return NextResponse.json({ error: "Design not found" }, { status: 404 });
    designId = d.id;
    cancelPath = `/design/${d.id}`;
    pending = body.lines.map((l) => ({ size: l.size, ...cleanPlayer(l), quantity: l.quantity }));
  } else if (body.mode === "team") {
    const team = await getTeamForOwner(body.teamId, actor);
    if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });
    designId = team.design_id;
    teamId = team.id;
    cancelPath = `/teams/${team.id}`;
    let q = db.from("roster_entries").select("*").eq("team_id", team.id).is("order_id", null);
    if (body.entryIds?.length) q = q.in("id", body.entryIds);
    const { data: entries } = await q;
    if (!entries?.length) return NextResponse.json({ error: "No unordered players on the roster" }, { status: 400 });
    pending = entries.map((e) => ({
      size: e.size,
      ...cleanPlayer({ name: e.player_name, number: e.number }),
      quantity: e.quantity,
      roster_entry_id: e.id,
    }));
  } else {
    const found = await getTeamBySlug(body.slug);
    if (!found || !found.team.share_enabled) return NextResponse.json({ error: "This team link isn't active." }, { status: 404 });
    designId = found.design.id;
    teamId = found.team.id;
    cancelPath = `/t/${body.slug}`;
    const e = cleanEntry(body.entry);
    pending = [
      {
        size: e.size,
        ...cleanPlayer({ name: e.player_name, number: e.number }),
        quantity: e.quantity,
        new_roster_entry: { team_id: found.team.id, email: e.email ?? null },
      },
    ];
  }

  const design = (await getDesign(designId))!;
  const products = await getOrderableProducts(design.spec.product);
  if (!products.some((p) => p.variants?.length))
    return NextResponse.json({ error: "This jersey isn't available yet. Please try again soon." }, { status: 503 });

  const items: OrderItem[] = [];
  for (const p of pending) {
    let v: ReturnType<typeof variantForSize<OrderableVariant>> = null;
    let productKey = "";
    for (const prod of products) {
      v = variantForSize(prod.variants, p.size);
      if (v) {
        productKey = prod.key;
        break;
      }
    }
    if (!v) return NextResponse.json({ error: `Size ${p.size} isn't available for this jersey` }, { status: 400 });
    items.push({
      ...p,
      design_id: design.id,
      sport: design.sport,
      product_key: productKey,
      variant_id: v.id,
      size: v.size,
      unit_cost_cents: v.cost,
      unit_price_cents: priceCents(v.cost),
    });
  }
  const subtotal = items.reduce((s, i) => s + i.unit_price_cents * i.quantity, 0);
  const shipping = env.shippingCents();

  const { data: order, error } = await db
    .from("orders")
    .insert({
      user_id: actor.kind === "user" ? actor.userId : null,
      team_id: teamId,
      email: actor.kind === "user" ? actor.email : body.mode === "member" ? body.entry.email ?? null : null,
      items,
      subtotal_cents: subtotal,
      shipping_cents: shipping,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const site = env.siteUrl();
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: actor.kind === "user" ? actor.email ?? undefined : body.mode === "member" ? body.entry.email ?? undefined : undefined,
    line_items: items.map((i) => ({
      quantity: i.quantity,
      price_data: {
        currency: "usd",
        unit_amount: i.unit_price_cents,
        product_data: {
          name: `${design.title} · ${STANDARDS[design.sport].label} jersey`,
          description: [`Size ${i.size}`, i.name, i.number && `#${i.number}`].filter(Boolean).join(" · "),
        },
      },
    })),
    shipping_address_collection: { allowed_countries: [...COUNTRIES] },
    shipping_options: [
      {
        shipping_rate_data: {
          display_name: "Standard shipping",
          type: "fixed_amount",
          fixed_amount: { amount: shipping, currency: "usd" },
        },
      },
    ],
    phone_number_collection: { enabled: true },
    metadata: { order_id: order.id },
    success_url: `${site}/order/success?order=${order.id}`,
    cancel_url: `${site}${cancelPath}`,
  });

  await db.from("orders").update({ stripe_session_id: session.id }).eq("id", order.id);
  return NextResponse.json({ url: session.url });
}
