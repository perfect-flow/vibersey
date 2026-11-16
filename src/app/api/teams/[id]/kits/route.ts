import { NextResponse } from "next/server";
import { z } from "zod";
import { getActor } from "@/lib/usage";
import { getDesign } from "@/lib/designs";
import { getKits, getTeamForOwner } from "@/lib/teams";
import { applyColors } from "@/lib/colorways";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/).transform((s) => s.toUpperCase());
const Body = z.object({
  label: z.string().trim().min(1).max(30),
  colors: z.object({ primary: hex, secondary: hex, accent: hex, text: hex, outline: hex }),
});

// Add a colorway (e.g. an away kit). It copies the team's locked design and
// changes nothing but the colors, so every kit shares the same layout, fonts,
// graphics and logo.
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const actor = await getActor();
  const team = await getTeamForOwner(id, actor);
  if (!team || actor.kind !== "user") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Pick a name and five colors for the kit." }, { status: 400 });
  const base = await getDesign(team.design_id);
  if (!base) return NextResponse.json({ error: "Team design missing" }, { status: 500 });
  const kits = await getKits(team);
  if (kits.length >= 6) return NextResponse.json({ error: "A team can have up to 6 kits." }, { status: 400 });
  if (kits.some((k) => k.label.toLowerCase() === parsed.data.label.toLowerCase()))
    return NextResponse.json({ error: "There's already a kit with that name." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: design, error: e1 } = await db
    .from("designs")
    .insert({
      owner_id: actor.userId,
      sport: base.sport,
      title: `${team.name} ${parsed.data.label} (team kit)`,
      spec: applyColors(base.spec, parsed.data.colors),
      locked: true,
    })
    .select("id, spec")
    .single();
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
  const { data: kit, error: e2 } = await db
    .from("team_kits")
    .insert({ team_id: team.id, design_id: design.id, label: parsed.data.label })
    .select("id, label, design_id")
    .single();
  if (e2) {
    await db.from("designs").delete().eq("id", design.id);
    const missing = /team_kits/.test(e2.message) && /exist|schema cache/i.test(e2.message);
    return NextResponse.json(
      { error: missing ? "Kits need a one-time database update (supabase/migrations/0002_team_kits.sql)." : e2.message },
      { status: 500 }
    );
  }
  return NextResponse.json({ kit: { ...kit, spec: design.spec } });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const team = await getTeamForOwner(id, await getActor());
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const kitId = new URL(req.url).searchParams.get("kitId") ?? "";
  const { error } = await supabaseAdmin().from("team_kits").delete().eq("id", kitId).eq("team_id", team.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
