import { NextResponse } from "next/server";
import { customAlphabet } from "nanoid";
import { getActor } from "@/lib/usage";
import { getDesignForActor } from "@/lib/designs";
import { supabaseAdmin } from "@/lib/supabase/admin";

const slug = customAlphabet("abcdefghjkmnpqrstuvwxyz23456789", 10);

// Create a team template. The design is snapshotted into a locked copy so every
// player's jersey uses the exact same artwork, colors and fonts, even if the
// manager keeps editing the original design.
export async function POST(req: Request) {
  const actor = await getActor();
  if (actor.kind !== "user") return NextResponse.json({ error: "signup_required" }, { status: 401 });
  const { designId, name } = await req.json();
  const design = await getDesignForActor(String(designId ?? ""), actor);
  if (!design) return NextResponse.json({ error: "Design not found" }, { status: 404 });

  const db = supabaseAdmin();
  const { data: snapshot, error: e1 } = await db
    .from("designs")
    .insert({
      owner_id: actor.userId,
      sport: design.sport,
      title: `${design.title} (team template)`,
      spec: design.spec,
      locked: true,
    })
    .select("id")
    .single();
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  const teamName = (typeof name === "string" && name.trim()) || design.spec.teamName || design.spec.wordmark.text || design.title;
  const { data: team, error: e2 } = await db
    .from("teams")
    .insert({ owner_id: actor.userId, design_id: snapshot.id, name: teamName.slice(0, 60), share_slug: slug() })
    .select("*")
    .single();
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  return NextResponse.json({ team });
}
