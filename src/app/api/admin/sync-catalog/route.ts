import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { syncCatalog } from "@/lib/printful";

export const maxDuration = 120;

// Pull jerseys, sizes, costs and print-file sizes from Printful.
// curl -X POST -H "Authorization: Bearer $ADMIN_SECRET" https://<site>/api/admin/sync-catalog
export async function POST(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${env.adminSecret()}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ results: await syncCatalog() });
}
