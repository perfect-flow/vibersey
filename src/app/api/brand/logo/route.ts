import { NextResponse } from "next/server";
import { z } from "zod";
import { SPORTS } from "@/lib/catalog";
import { getActor, consumeGeneration } from "@/lib/usage";
import { generateImage } from "@/lib/openrouter";
import { knockOutBackground, uploadPublic } from "@/lib/images";

export const maxDuration = 120;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const Body = z.object({
  kind: z.enum(["main", "alternate"]),
  prompt: z.string().trim().min(2).max(600),
  sport: z.enum(SPORTS),
  colors: z.array(hex).max(8).default([]),
  style: z.string().max(300).optional(),
  // the logo to edit ("make the horse white"), or the main logo an alternate is derived from
  reference: z.string().url().nullable().optional(),
  mode: z.enum(["new", "edit"]).default("new"),
});

// The logo builder: draw a new logo, edit an existing one, or derive an
// alternate (shoulder) logo from the main one. Counts as one AI generation.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Describe the logo you want." }, { status: 400 });
  const { kind, prompt, sport, colors, style, reference, mode } = parsed.data;
  const usage = await consumeGeneration(await getActor());
  if (!usage.allowed) return NextResponse.json({ error: "signup_required", usage }, { status: 402 });

  const palette = colors.length ? ` Use only these colors: ${colors.join(", ")}.` : "";
  const look = style ? ` Brand style: ${style}.` : "";
  const rules = `Bold flat vector style, thick clean outlines.${palette}${look} Centered, filling most of the frame, on a plain solid pure white (#FFFFFF) background. No text, no letters, no numbers, no mockup, no jersey.`;
  let full: string;
  if (mode === "edit" && reference) {
    full = `Edit the attached ${sport} team logo: ${prompt}. Keep everything else about it the same (subject, composition, line style and proportions) unless the instruction says otherwise. Return the complete edited logo. ${rules}`;
  } else if (kind === "alternate") {
    full = `${prompt}\n\nAn alternate / secondary ${sport} team logo${reference ? " derived from the attached primary logo, in the same drawing style and colors" : ""}: simpler and more compact so it reads well small as a shoulder or sleeve patch (for example a circular badge or the mascot's head alone). ${rules}`;
  } else {
    full = `${prompt}\n\nPrimary ${sport} team emblem / crest. ${rules}`;
  }

  try {
    const img = await generateImage(full, { aspectRatio: "1:1", reference: reference ?? undefined });
    const png = await knockOutBackground(img.bytes);
    const url = await uploadPublic("artwork", png, "image/png", "logo/");
    return NextResponse.json({ url, prompt, usage });
  } catch (e) {
    console.error("brand logo:", e);
    return NextResponse.json({ error: "Couldn't draw that logo this time. Please try again.", usage }, { status: 502 });
  }
}
