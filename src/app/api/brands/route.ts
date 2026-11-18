import { NextResponse } from "next/server";
import { z } from "zod";
import { getActor, type Actor } from "@/lib/usage";
import { BrandSchema } from "@/lib/design-spec";
import { supabaseAdmin } from "@/lib/supabase/admin";

// The customer's saved brand boards, to start other jerseys from.
// Needs migration 0003_brand_boards.sql; until it has run, the list is empty
// and saving explains what's missing.

const owner = (a: Actor) => (a.kind === "user" ? { col: "owner_id", id: a.userId } : { col: "anon_id", id: a.anonId });
const missingTable = (msg?: string) => !!msg && /brand_boards|relation|schema cache/i.test(msg);

export async function GET() {
  const o = owner(await getActor());
  const { data, error } = await supabaseAdmin()
    .from("brand_boards")
    .select("id, name, brand, updated_at")
    .eq(o.col, o.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ brands: [], unavailable: missingTable(error.message) });
  const brands = (data ?? []).flatMap((r) => {
    const b = BrandSchema.safeParse({ ...r.brand, savedId: r.id });
    return b.success ? [{ id: r.id, name: r.name, brand: b.data, updated_at: r.updated_at }] : [];
  });
  return NextResponse.json({ brands });
}

const SaveBody = z.object({ brand: BrandSchema });

// Save a brand board (updates it when it was saved before).
export async function POST(req: Request) {
  const actor = await getActor();
  const parsed = SaveBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid brand board" }, { status: 400 });
  const brand = parsed.data.brand;
  const o = owner(actor);
  const db = supabaseAdmin();
  const row = {
    name: brand.name || "My brand",
    brand: { ...brand, savedId: null },
    owner_id: actor.kind === "user" ? actor.userId : null,
    anon_id: actor.kind === "anon" ? actor.anonId : null,
    updated_at: new Date().toISOString(),
  };
  const q = brand.savedId
    ? db.from("brand_boards").update(row).eq("id", brand.savedId).eq(o.col, o.id).select("id").maybeSingle()
    : db.from("brand_boards").insert(row).select("id").single();
  let { data, error } = await q;
  // saved under another visitor id (or deleted): save a fresh copy
  if (!error && !data) ({ data, error } = await db.from("brand_boards").insert(row).select("id").single());
  if (error)
    return NextResponse.json(
      { error: missingTable(error.message) ? "Saving brands isn't switched on yet (database update pending)." : error.message },
      { status: missingTable(error.message) ? 503 : 500 }
    );
  return NextResponse.json({ id: data!.id });
}

export async function DELETE(req: Request) {
  const o = owner(await getActor());
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await supabaseAdmin().from("brand_boards").delete().eq("id", id).eq(o.col, o.id);
  return NextResponse.json({ ok: true });
}
