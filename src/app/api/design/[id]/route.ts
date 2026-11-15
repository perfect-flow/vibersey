import { NextResponse } from "next/server";
import { DesignSpecSchema } from "@/lib/design-spec";
import { getActor } from "@/lib/usage";
import { getDesignForActor, getMessages } from "@/lib/designs";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const design = await getDesignForActor(id, await getActor());
  if (!design) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ design, messages: await getMessages(id) });
}

// Manual edits from the controls panel (colors, fonts, sample name/number,
// uploaded logo). These don't count toward the free AI generations.
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const actor = await getActor();
  const design = await getDesignForActor(id, actor);
  if (!design) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.spec) {
    if (design.locked) return NextResponse.json({ error: "Team templates can't be changed." }, { status: 409 });
    const spec = DesignSpecSchema.safeParse({ ...body.spec, sport: design.sport });
    if (!spec.success) return NextResponse.json({ error: "Invalid design" }, { status: 400 });
    update.spec = spec.data;
  }
  if (typeof body.title === "string") update.title = body.title.slice(0, 80);
  // "Save" claims an anonymous draft for the signed-in user
  if (body.save) {
    if (actor.kind !== "user") return NextResponse.json({ error: "signup_required" }, { status: 401 });
    update.owner_id = actor.userId;
    update.anon_id = null;
  }
  const { data, error } = await supabaseAdmin().from("designs").update(update).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ design: data });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const design = await getDesignForActor(id, await getActor());
  if (!design) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (design.locked) return NextResponse.json({ error: "This design is used by a team." }, { status: 409 });
  await supabaseAdmin().from("designs").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
