import { NextResponse } from "next/server";
import { z } from "zod";
import { getActor } from "@/lib/usage";
import { getTeamForOwner, RosterEntryInput, cleanEntry } from "@/lib/teams";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

const AddBody = z.object({
  source: z.enum(["manual", "csv"]).default("manual"),
  entries: z.array(RosterEntryInput).min(1).max(500),
});

// Add players by manual entry or CSV import (the CSV is parsed in the browser).
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const team = await getTeamForOwner(id, await getActor());
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = AddBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid roster" }, { status: 400 });
  const rows = parsed.data.entries.map((e) => ({ ...cleanEntry(e), team_id: id, source: parsed.data.source }));
  const { data, error } = await supabaseAdmin().from("roster_entries").insert(rows).select("*");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entries: data });
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const team = await getTeamForOwner(id, await getActor());
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  const parsed = RosterEntryInput.safeParse(body);
  if (!parsed.success || typeof body.id !== "string") return NextResponse.json({ error: "Invalid entry" }, { status: 400 });
  const { data, error } = await supabaseAdmin()
    .from("roster_entries")
    .update(cleanEntry(parsed.data))
    .eq("id", body.id)
    .eq("team_id", id)
    .is("order_id", null)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "Couldn't update (already ordered?)" }, { status: 400 });
  return NextResponse.json({ entry: data });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const team = await getTeamForOwner(id, await getActor());
  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const entryId = new URL(req.url).searchParams.get("entryId");
  await supabaseAdmin().from("roster_entries").delete().eq("id", entryId ?? "").eq("team_id", id).is("order_id", null);
  return NextResponse.json({ ok: true });
}
