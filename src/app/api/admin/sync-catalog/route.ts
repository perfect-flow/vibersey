import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { syncCatalog } from "@/lib/printful";

export const maxDuration = 120;

// Pull jerseys, sizes, costs and print-file sizes from Printful.
// curl -X POST -H "Authorization: Bearer $ADMIN_SECRET" https://<site>/api/admin/sync-catalog
export async function POST(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ results: await syncCatalog() });
}

// GET with ?secret= so it can be triggered from a browser.
export const GET = POST;
