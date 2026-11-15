import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Printful order status updates. Register this URL in Printful's webhook
// settings with ?secret=<ADMIN_SECRET>.
const STATUS: Record<string, string> = {
  package_shipped: "shipped",
  order_fulfilled: "fulfilled",
  order_canceled: "canceled",
  order_failed: "failed",
};

export async function POST(req: Request) {
  if (new URL(req.url).searchParams.get("secret") !== process.env.ADMIN_SECRET)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const status = STATUS[body?.type];
  const pfId = body?.data?.order?.id;
  if (status && pfId) {
    await supabaseAdmin().from("orders").update({ status, updated_at: new Date().toISOString() }).eq("printful_order_id", pfId);
  }
  return NextResponse.json({ ok: true });
}
