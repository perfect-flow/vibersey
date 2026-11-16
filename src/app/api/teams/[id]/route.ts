import { NextResponse } from "next/server";
import { getActor } from "@/lib/usage";
import { getDesign } from "@/lib/designs";
import { getKits, getTeamForOwner } from "@/lib/teams";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const team = await getTeamForOwner(id, await getActor());
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const [design, kits, { data: roster }] = await Promise.all([
    getDesign(team.design_id),
    getKits(team),
    supabaseAdmin().from("roster_entries").select("*").eq("team_id", id).order("created_at"),
  ]);
  return NextResponse.json({ team, design, kits, roster: roster ?? [] });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const team = await getTeamForOwner(id, await getActor());
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  const update: Record<string, unknown> = {};
  if (typeof body.name === "string") update.name = body.name.slice(0, 60);
  if (typeof body.share_enabled === "boolean") update.share_enabled = body.share_enabled;
  const { data, error } = await supabaseAdmin().from("teams").update(update).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ team: data });
}
