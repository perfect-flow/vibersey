import { NextResponse } from "next/server";
import { z } from "zod";
import { getActor } from "@/lib/usage";
import { canEdit, getDesign } from "@/lib/designs";
import { DesignSpecSchema, cleanPlayer } from "@/lib/design-spec";
import { cachedMockups, checkMockup, mockupKey, MockupError, startMockup } from "@/lib/mockups";

export const maxDuration = 60;

const Body = z.object({
  designId: z.string().uuid(),
  // the editor's live spec, so unsaved tweaks show up (owners only)
  spec: z.unknown().optional(),
  player: z.object({ name: z.string().max(16).default(""), number: z.string().max(3).default("") }).optional(),
});

// Start (or reuse) a Printful mockup of a design on its models.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const design = await getDesign(parsed.data.designId);
  if (!design) return NextResponse.json({ error: "Design not found" }, { status: 404 });

  let spec = design.spec;
  if (parsed.data.spec && !design.locked && canEdit(design, await getActor())) {
    const live = DesignSpecSchema.safeParse({ ...(parsed.data.spec as object), sport: design.spec.sport, product: design.spec.product });
    if (live.success) spec = live.data;
  }
  const player = cleanPlayer(parsed.data.player ?? spec.sample);
  const key = mockupKey(spec, player);
  try {
    const cached = await cachedMockups(key);
    if (cached) return NextResponse.json({ status: "completed", images: cached });
    const task = await startMockup(spec, player);
    return NextResponse.json({ status: "pending", task, key });
  } catch (e) {
    console.error("mockups: start failed", e);
    const status = e instanceof MockupError ? e.status : 502;
    return NextResponse.json({ error: e instanceof MockupError ? e.message : "Couldn't start the model preview. Please try again." }, { status });
  }
}

// Poll a running mockup task.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const task = url.searchParams.get("task") ?? "";
  const key = url.searchParams.get("key");
  if (!/^[\w-]{4,80}$/.test(task)) return NextResponse.json({ error: "Invalid task" }, { status: 400 });
  try {
    return NextResponse.json(await checkMockup(task, key && /^[0-9a-f]{24}$/.test(key) ? key : null));
  } catch (e) {
    console.error("mockups: poll failed", e);
    return NextResponse.json({ status: "failed", images: [], error: "Couldn't load the model preview." }, { status: 502 });
  }
}
