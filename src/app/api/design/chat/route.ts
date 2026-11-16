import { NextResponse } from "next/server";
import { z } from "zod";
import { SPORTS, productByKey } from "@/lib/catalog";
import { defaultSpec, DesignSpecSchema } from "@/lib/design-spec";
import { getActor, consumeGeneration } from "@/lib/usage";
import { getDesignForActor, getMessages } from "@/lib/designs";
import { runDesignTurn } from "@/lib/designer";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 120;

const Body = z.object({
  designId: z.string().uuid().nullable().optional(),
  sport: z.enum(SPORTS),
  message: z.string().min(1).max(2000),
  inspirationImage: z.string().url().nullable().optional(),
  // the jersey picked (new designs) and the editor's current spec, so manual
  // edits and uploads that haven't been saved yet aren't lost
  product: z.string().optional(),
  spec: z.unknown().optional(),
});

// One design/edit turn with the AI. Counts toward the anonymous free limit.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { designId, sport, message, inspirationImage, product, spec: draftSpec } = parsed.data;
  const actor = await getActor();
  const db = supabaseAdmin();

  let design = designId ? await getDesignForActor(designId, actor) : null;
  if (designId && !design) return NextResponse.json({ error: "Design not found" }, { status: 404 });
  if (design?.locked)
    return NextResponse.json({ error: "This design is a team template and can't be changed. Duplicate it to keep designing." }, { status: 409 });

  const usage = await consumeGeneration(actor);
  if (!usage.allowed) return NextResponse.json({ error: "signup_required", usage }, { status: 402 });

  if (!design) {
    const { data, error } = await db
      .from("designs")
      .insert({
        sport,
        spec: startingSpec(sport, product, draftSpec),
        owner_id: actor.kind === "user" ? actor.userId : null,
        anon_id: actor.kind === "anon" ? actor.anonId : null,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    design = data;
  }

  // Prefer the editor's current spec (it may hold a just-uploaded logo or a
  // tweak still waiting on its debounced save). Sport and product can't change.
  let current = design!.spec;
  if (designId && draftSpec && typeof draftSpec === "object") {
    const fromClient = DesignSpecSchema.safeParse({ ...draftSpec, sport: design!.spec.sport, product: design!.spec.product });
    if (fromClient.success) current = fromClient.data;
  }

  const history = await getMessages(design!.id);
  try {
    const result = await runDesignTurn({ spec: current, history, message, inspirationImage });
    const title = result.title && design!.title === "Untitled jersey" ? result.title : design!.title;
    await db.from("designs").update({ spec: result.spec, title, updated_at: new Date().toISOString() }).eq("id", design!.id);
    await db.from("design_messages").insert([
      { design_id: design!.id, role: "user", content: message },
      { design_id: design!.id, role: "assistant", content: result.reply },
    ]);
    return NextResponse.json({ designId: design!.id, title, spec: result.spec, reply: result.reply, usage });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "The designer had a hiccup. Please try again.", designId: design!.id, usage }, { status: 502 });
  }
}

function startingSpec(sport: (typeof SPORTS)[number], product: string | undefined, draft: unknown) {
  const def = product ? productByKey(product) : undefined;
  const base = defaultSpec(sport, def?.sport === sport ? def.key : undefined);
  const parsed = DesignSpecSchema.safeParse({ ...base, ...(typeof draft === "object" && draft ? draft : {}), sport, product: base.product });
  return parsed.success ? parsed.data : base;
}
