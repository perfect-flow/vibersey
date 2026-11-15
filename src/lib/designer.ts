import "server-only";
import { STANDARDS, productByKey } from "./catalog";
import { DesignSpecSchema, FONTS, type DesignSpec } from "./design-spec";
import { chatTool, generateImage } from "./openrouter";
import { knockOutBackground, uploadPublic } from "./images";

type ChatTurn = { role: "user" | "assistant"; content: string };

type ToolArgs = {
  reply: string;
  spec: unknown;
  artwork_prompt?: string | null;
  logo_prompt?: string | null;
  title?: string | null;
};

const fontList = Object.entries(FONTS)
  .map(([k, f]) => `${k} (${f.label})`)
  .join(", ");

function systemPrompt(spec: DesignSpec) {
  const std = STANDARDS[spec.sport];
  const product = productByKey(spec.product)!;
  return `You are Vibersey's jersey designer. You chat with a customer and design a custom ${std.label.toLowerCase()} jersey that Printful will print on its "${product.title}" (all-over sublimation print, panels: ${product.placements.join(", ")}).

Sport standards you must follow:
${std.guidance}

How designs work:
- You always call the apply_design tool. "spec" is the COMPLETE updated design (copy unchanged fields from the current spec).
- Colors are 6-digit hex. Make sure name/number "text" and "outline" colors contrast strongly with "primary" and with any artwork.
- Fonts are limited to these keys: ${fontList}. Names and numbers use lettering.nameFont / lettering.numberFont. Pick fonts that suit the sport (block/varsity for numbers; script only for baseball wordmarks).
- Player names and numbers are drawn by code, never by the image model. Never put words, letters or numbers into artwork or logo prompts.
- pattern.style can be solid, stripes, pinstripes, hoops, gradient, or artwork. Use "artwork" for anything more creative (camo, flames, geometric, brush strokes, cityscapes, inspiration images). When you want new artwork, set artwork_prompt to a vivid description of a full-bleed, seamless, TEXT-FREE textile graphic using the jersey's colors. Leave artwork_prompt null to keep the current artwork.
- If the customer wants an AI logo, set logo_prompt to a description of a flat, bold, vector-style sports emblem with NO text, centered on a plain pure white background. Leave null otherwise. If they uploaded a logo (logo.source = "upload"), keep it unless they ask to replace it.
- wordmark.text is the team name shown on the chest (uppercase usually, max 30 chars). sample.name / sample.number are only preview values.
- Keep the chat reply short and friendly (1-3 sentences): say what you changed and suggest one next idea. Ask about team name, colors, logo and inspiration if you don't know them yet.
- title is a short name for this design, e.g. "Riverside Hawks Home".

Current spec:
${JSON.stringify(spec)}`;
}

const TOOL = {
  name: "apply_design",
  description: "Apply the updated jersey design and reply to the customer.",
  parameters: {
    type: "object",
    properties: {
      reply: { type: "string", description: "Short message to the customer." },
      title: { type: ["string", "null"] },
      spec: { type: "object", description: "The complete updated DesignSpec JSON." },
      artwork_prompt: { type: ["string", "null"] },
      logo_prompt: { type: ["string", "null"] },
    },
    required: ["reply", "spec"],
  },
};

// Deep-merge the model's spec onto the current one so missing fields survive.
function merge<T>(base: T, patch: unknown): T {
  if (typeof base !== "object" || base === null || Array.isArray(base)) return (patch ?? base) as T;
  if (typeof patch !== "object" || patch === null) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = k in out ? merge(out[k], v) : v;
  }
  return out as T;
}

export async function runDesignTurn(input: {
  spec: DesignSpec;
  history: ChatTurn[];
  message: string;
  inspirationImage?: string | null; // data URL or public URL the customer attached
}) {
  const userContent: unknown[] = [{ type: "text", text: input.message }];
  if (input.inspirationImage) userContent.push({ type: "image_url", image_url: { url: input.inspirationImage } });

  const args = await chatTool<ToolArgs>({
    tool: TOOL,
    messages: [
      { role: "system", content: systemPrompt(input.spec) },
      ...input.history.slice(-12).map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: userContent },
    ],
  });

  // never let the model change the sport or drop a customer's uploaded logo
  let next = merge(input.spec, args.spec);
  next.sport = input.spec.sport;
  next.product = input.spec.product;
  if (input.spec.logo.source === "upload" && !args.logo_prompt) next.logo = input.spec.logo;
  const parsed = DesignSpecSchema.safeParse(next);
  next = parsed.success ? parsed.data : input.spec;

  const { colors } = next;
  const palette = `${colors.primary}, ${colors.secondary}, ${colors.accent}`;
  const jobs: Promise<void>[] = [];

  if (args.artwork_prompt) {
    const prompt = `${args.artwork_prompt}\n\nFull-bleed seamless textile print for a sublimated ${next.sport} jersey panel, portrait orientation. Color palette: ${palette}. Absolutely no text, letters, numbers, logos, people, mannequins or garment outlines. Flat artwork only, edge to edge.`;
    jobs.push(
      generateImage(prompt, { aspectRatio: "4:5", reference: input.inspirationImage ?? undefined }).then(async (img) => {
        next.pattern = {
          ...next.pattern,
          style: "artwork",
          artworkUrl: await uploadPublic("artwork", img.bytes, img.mime, "art/"),
          artworkPrompt: args.artwork_prompt ?? null,
        };
      })
    );
  }

  if (args.logo_prompt) {
    const prompt = `${args.logo_prompt}\n\nSports team emblem, bold flat vector style, thick clean outlines, colors ${palette}. Centered, filling most of the frame, on a plain solid pure white (#FFFFFF) background. No text, no letters, no numbers, no mockup.`;
    jobs.push(
      generateImage(prompt, { aspectRatio: "1:1" }).then(async (img) => {
        const png = await knockOutBackground(img.bytes);
        next.logo = { url: await uploadPublic("artwork", png, "image/png", "logo/"), source: "ai", prompt: args.logo_prompt ?? null };
      })
    );
  }

  const results = await Promise.allSettled(jobs);
  const failed = results.filter((r) => r.status === "rejected").length;
  let reply = args.reply;
  if (failed) reply += " (I couldn't generate one of the images this time. Ask me to try again.)";

  return { spec: next, reply, title: args.title ?? null };
}
