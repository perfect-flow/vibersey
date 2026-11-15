import { NextResponse } from "next/server";
import { getActor } from "@/lib/usage";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { SPORTS, PRODUCTS } from "@/lib/catalog";
import { DesignSpecSchema, defaultSpec } from "@/lib/design-spec";

// Saved designs for the signed-in user, plus team templates.
export async function GET() {
  const actor = await getActor();
  if (actor.kind !== "user") return NextResponse.json({ error: "signup_required" }, { status: 401 });
  const db = supabaseAdmin();
  const [{ data: designs }, { data: teams }] = await Promise.all([
    db.from("designs").select("id, title, sport, spec, locked, updated_at").eq("owner_id", actor.userId).order("updated_at", { ascending: false }),
    db.from("teams").select("id, name, design_id, share_slug, created_at").eq("owner_id", actor.userId).order("created_at", { ascending: false }),
  ]);
  return NextResponse.json({ designs: designs ?? [], teams: teams ?? [] });
}

// Create a design without an AI turn (e.g. the visitor tweaked colors or
// uploaded a logo first). Doesn't count toward free generations.
export async function POST(req: Request) {
  const actor = await getActor();
  const body = await req.json();
  const sport = SPORTS.find((s) => s === body.sport);
  if (!sport) return NextResponse.json({ error: "Pick a sport" }, { status: 400 });
  const base = defaultSpec(sport, PRODUCTS.find((p) => p.key === body.product && p.sport === sport)?.key);
  const parsed = DesignSpecSchema.safeParse({ ...base, ...(body.spec ?? {}), sport, product: base.product });
  const { data, error } = await supabaseAdmin()
    .from("designs")
    .insert({
      sport,
      spec: parsed.success ? parsed.data : base,
      owner_id: actor.kind === "user" ? actor.userId : null,
      anon_id: actor.kind === "anon" ? actor.anonId : null,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ design: data });
}
