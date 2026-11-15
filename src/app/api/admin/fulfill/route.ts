import { NextResponse, after } from "next/server";
import { isAdmin } from "@/lib/admin";
import { fulfillOrder } from "@/lib/orders";

export const maxDuration = 300;

// Retry fulfillment for a paid order that failed to reach Printful.
// curl -X POST -H "Authorization: Bearer $ADMIN_SECRET" "https://<site>/api/admin/fulfill?order=<id>"
export async function POST(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("order");
  if (!id) return NextResponse.json({ error: "order is required" }, { status: 400 });
  after(() => fulfillOrder(id));
  return NextResponse.json({ ok: true, queued: id });
}

// GET with ?secret= so it can be triggered from a browser.
export const GET = POST;
