import "server-only";
import { z } from "zod";
import { STANDARDS, DEFAULT_LOGO_POSITION, DEFAULT_PATCH_POSITION, PATCH_GUIDANCE, PATCH_POSITIONS, productByKey } from "./catalog";
import { BrandSchema, DesignSpecSchema, FONTS, brandFromSpec, brandPalette, nearestBrandColor, type Brand, type DesignSpec } from "./design-spec";
import { chatTool, generateImage } from "./openrouter";
import { knockOutBackground, uploadPublic } from "./images";

type ChatTurn = { role: "user" | "assistant"; content: string };

type ToolArgs = {
  reply: string;
  spec: unknown;
  artwork_prompt?: string | null;
  logo_prompt?: string | null;
  alt_logo_prompt?: string | null;
  brand?: unknown;
  title?: string | null;
};

const fontList = Object.entries(FONTS)
  .map(([k, f]) => `${k} (${f.label})`)
  .join(", ");

function brandSection(spec: DesignSpec) {
  const b = spec.brand;
  if (!b)
    return `Brand board: NONE YET. Building it comes first. If the customer hasn't told you their colors, logo or inspiration, ask for them (they can upload images with the paperclip or paste a link). As soon as you know the colors, or they ask you to choose, fill the "brand" field: name (team name), colors (the five roles, same meaning as spec.colors), up to 4 extras (more brand colors), fonts (wordmark, number, name), and style (one line describing the look). Apply the same colors and fonts to the jersey spec in the same turn.`;
  return `Brand board (the team's identity; follow it on EVERY edit so the design never drifts):
${JSON.stringify({ name: b.name, colors: b.colors, extras: b.extras, fonts: b.fonts, style: b.style, mainLogo: b.logos.main ? "set" : "none", alternateLogo: b.logos.alternate ? "set" : "none" })}
Rules: jersey colors must come from the brand palette (its colors, extras, white or black); you may rearrange them (e.g. a white away jersey). Use the brand fonts. Keep the brand logos. Only change the brand board when the customer asks to change their brand (new colors, fonts, name or style); then send the updated "brand" field and apply it to the jersey. A request for a color that isn't in the brand means adding it to brand.extras (or replacing a brand color if they say so). Leave "brand" null otherwise.`;
}

function systemPrompt(spec: DesignSpec) {
  const std = STANDARDS[spec.sport];
  const product = productByKey(spec.product)!;
  const forPrompt: Record<string, unknown> = { ...spec };
  delete forPrompt.brand;
  return `You are Vibersey's jersey designer. You chat with a customer and design a custom ${std.label.toLowerCase()} jersey that Printful will print on its "${product.title}" (all-over sublimation print, panels: ${product.placements.join(", ")}).

Sport standards you must follow:
${std.guidance}

How designs work:
- You always call the apply_design tool. "spec" is the COMPLETE updated design (copy unchanged fields from the current spec).
- Colors are 6-digit hex. Make sure name/number "text" and "outline" colors contrast strongly with "primary" and with any artwork.
- Fonts are limited to these keys: ${fontList}. Names and numbers use lettering.nameFont / lettering.numberFont. Pick fonts that suit the sport (block/varsity for numbers; script only for baseball wordmarks).
- Player names and numbers are drawn by code, never by the image model. Never put words, letters or numbers into artwork or logo prompts.
- pattern.style can be solid, stripes, pinstripes, hoops, gradient, or artwork. Use "artwork" for anything more creative (camo, flames, geometric, brush strokes, cityscapes, inspiration images). When you want new artwork, set artwork_prompt to a vivid description of a full-bleed, seamless, TEXT-FREE textile graphic using the jersey's colors. Leave artwork_prompt null to keep the current artwork.
- Logo size and placement: logo.position is one of auto (the sport's usual spot, currently ${DEFAULT_LOGO_POSITION[spec.sport].replace("_", " ")}), above_name (centered above the chest team name), center_chest (big crest in the middle of the chest), left_chest, right_chest, sleeves, upper_back. logo.scale multiplies the size (0.5 to 3, 1 = standard). When asked to make the logo bigger, raise logo.scale by about 0.5 each time; for a really big logo use center_chest, and turn off wordmark.show and lettering.numberFront if they would overlap it. When asked for smaller, lower it. logo.offsetX / logo.offsetY nudge the logo from its spot, as fractions of the jersey panel (-0.5 to 0.5; negative = left / higher); move about 0.04 per "a bit higher/lower/left/right" and reset both to 0 when the position changes. lettering.numberScale (0.5 to 1.6) and lettering.nameScale (0.5 to 1.8) resize the player number and name (1 = standard); lettering.numberOffsetY and lettering.nameOffsetY (-0.3 to 0.3, negative = higher) move them up or down.
- Trim: trim.hemStripes (stripes around the waist hem), trim.sleeveStripes (stripes around the sleeves) and trim.yoke (contrasting shoulders) turn trim on or off. Stripe colors come from colors.secondary (the wide stripes) and colors.accent (the thin middle stripe). trim.hemStripesOffsetY moves the hem stripes up or down (-0.3 to 0.06, negative = higher, 0 = standard; about 0.04 per "a bit") and trim.sleeveStripesOffsetY does the same for the sleeve stripes (-0.3 to 0.15). The hem stripes are always drawn at the same height on the front and the back, measured from the side seam, so they line up where the panels are sewn together; moving them moves both. The back of the jersey is cut longer in the middle than the front, so the stripes sit further from the bottom edge at the center back than at the sides; that is normal and how team jerseys are made. If the customer says the stripes don't line up front to back, tell them they are now matched at the side seams, and adjust the height if they want. You can always change trim: never tell the customer stripe position is fixed or out of your control.
- Patches (jersey etiquette): ${PATCH_GUIDANCE[spec.sport]} patches.alternate shows the brand's alternate logo as a patch (show true/false; position: ${PATCH_POSITIONS.join(", ")}; "auto" = ${DEFAULT_PATCH_POSITION[spec.sport].alternate.replace("_", " ")} for this sport; scale 0.5 to 2). patches.captain.letter is "none", "C" (captain) or "A" (alternate captain); its position "auto" = ${DEFAULT_PATCH_POSITION[spec.sport].captain.replace("_", " ")}; style "letter" (outlined letter) or "patch" (letter on a square patch). Never put a logo on the shoulders by moving the main logo; shoulder badges are the alternate logo. When they want shoulder patches or an alternate logo and none exists (alternateLogo "none"), set alt_logo_prompt to a short description of a simpler secondary mark derived from the main logo (e.g. "the horse head alone inside a circle") and set patches.alternate.show true. The customer can also open "Logos & patches" to upload or generate logos themselves.
- Only set logo_prompt when the customer asks you to create a logo for them. Then describe a flat, bold, vector-style sports emblem with NO text, centered on a plain pure white background. Leave it null otherwise. If they uploaded a logo (logo.source = "upload"), keep it and never replace it unless they ask for a new one. If they mention their own logo but none is uploaded, tell them to tap "Upload logo" (or attach it with the paperclip) instead of drawing one.
- The team name printed on the chest is wordmark.text (uppercase usually, max 30 chars). Whenever the team name changes, set both teamName and wordmark.text, and set wordmark.show to true unless they ask to hide it.
- The player name and number shown on the jersey are sample.name (max 16 chars, uppercase) and sample.number (up to 3 digits). The name prints on the back only when lettering.showName is true, so set it to true when they want a name. Team orders replace these per player.
- Keep the chat reply short and friendly (1-3 sentences): say what you changed and suggest one next idea. Ask about team name, colors, logo and inspiration if you don't know them yet.
- title is a short name for this design, e.g. "Riverside Hawks Home".

${brandSection(spec)}

Current spec:
${JSON.stringify(forPrompt)}`;
}

// Give the model the real schema so it returns a proper object with valid fields.
const SPEC_JSON_SCHEMA = z.toJSONSchema(DesignSpecSchema.omit({ brand: true }), { io: "input" }) as Record<string, unknown>;
delete SPEC_JSON_SCHEMA.$schema;
const BRAND_JSON_SCHEMA = z.toJSONSchema(BrandSchema.omit({ logos: true, savedId: true }), { io: "input" }) as Record<string, unknown>;
delete BRAND_JSON_SCHEMA.$schema;

const TOOL = {
  name: "apply_design",
  description: "Apply the updated jersey design and reply to the customer.",
  parameters: {
    type: "object",
    properties: {
      reply: { type: "string", description: "Short message to the customer." },
      title: { type: ["string", "null"] },
      spec: { ...SPEC_JSON_SCHEMA, description: "The complete updated DesignSpec JSON object (not a string)." },
      artwork_prompt: { type: ["string", "null"] },
      logo_prompt: { type: ["string", "null"] },
      alt_logo_prompt: { type: ["string", "null"], description: "Only when an alternate/shoulder logo is wanted and none exists." },
      brand: {
        anyOf: [{ ...BRAND_JSON_SCHEMA, description: "The complete brand board, only when creating it or when the customer changes their brand." }, { type: "null" }],
      },
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

// Some models send the spec as a JSON string.
function asObject(v: unknown): Record<string, unknown> | null {
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

// Tidy values the model commonly gets slightly wrong so they still validate.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tidy(s: Record<string, any>) {
  const cut = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : v);
  if (s.colors && typeof s.colors === "object")
    for (const k of Object.keys(s.colors)) {
      const c = String(s.colors[k] ?? "").trim();
      const m = c.match(/^#?([0-9a-fA-F]{6})$/) ?? c.match(/^#?([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
      if (m) s.colors[k] = "#" + (m.length === 2 ? m[1] : m.slice(1, 4).map((x) => x + x).join("")).toUpperCase();
    }
  s.teamName = cut(s.teamName, 40);
  if (s.wordmark) s.wordmark.text = cut(s.wordmark.text, 30);
  if (s.sample) {
    if (typeof s.sample.name === "string") s.sample.name = s.sample.name.toUpperCase().slice(0, 16);
    if (s.sample.number != null) s.sample.number = String(s.sample.number).replace(/\D/g, "").slice(0, 3);
  }
  if (s.logo && typeof s.logo.scale === "number") s.logo.scale = Math.min(3, Math.max(0.5, s.logo.scale));
  if (s.pattern && typeof s.pattern.opacity === "number") s.pattern.opacity = Math.min(1, Math.max(0, s.pattern.opacity));
  if (s.lettering && typeof s.lettering.outlineWidth === "number") s.lettering.outlineWidth = Math.min(0.2, Math.max(0, s.lettering.outlineWidth));
  const clamp = (o: Record<string, unknown> | undefined, k: string, lo: number, hi: number) => {
    if (o && typeof o[k] === "number") o[k] = Math.min(hi, Math.max(lo, o[k] as number));
  };
  clamp(s.logo, "offsetX", -0.5, 0.5);
  clamp(s.logo, "offsetY", -0.5, 0.5);
  clamp(s.lettering, "numberScale", 0.5, 1.6);
  clamp(s.lettering, "nameScale", 0.5, 1.8);
  clamp(s.lettering, "numberOffsetY", -0.3, 0.3);
  clamp(s.lettering, "nameOffsetY", -0.3, 0.3);
  clamp(s.trim, "hemStripesOffsetY", -0.3, 0.06);
  clamp(s.trim, "sleeveStripesOffsetY", -0.3, 0.15);
}

// Merge the model's changes onto the current design. Each section is validated
// on its own, so one bad field only drops that section, not the whole turn.
function applyPatch(current: DesignSpec, patch: unknown): DesignSpec {
  const obj = asObject(patch);
  if (!obj) {
    console.warn("design turn: model spec was not an object");
    return current;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merged = merge(current, obj) as Record<string, any>;
  tidy(merged);
  // an unknown color (e.g. "navy") keeps that one color instead of dropping them all
  if (merged.colors && typeof merged.colors === "object")
    for (const k of Object.keys(current.colors) as (keyof DesignSpec["colors"])[])
      if (!/^#[0-9A-F]{6}$/i.test(String(merged.colors[k]))) merged.colors[k] = current.colors[k];
  const shape = DesignSpecSchema.shape as Record<string, z.ZodTypeAny>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(shape)) {
    const r = shape[key].safeParse(merged[key]);
    if (r.success) out[key] = r.data;
    else {
      console.warn(`design turn: dropped invalid ${key}`, JSON.stringify(r.error.issues).slice(0, 300));
      out[key] = (current as Record<string, unknown>)[key];
    }
  }
  const next = out as DesignSpec;
  next.sport = current.sport;
  next.product = current.product;
  // the brand board only changes through the "brand" field (see keepOnBrand),
  // and patch images only through the logo tools
  next.brand = current.brand;
  if (next.patches && current.patches) next.patches.alternate.url = current.patches.alternate.url;
  // keep the chest wordmark in step when only the team name was changed
  if (next.teamName && next.teamName !== current.teamName && next.wordmark.text === current.wordmark.text) {
    next.wordmark = { ...next.wordmark, text: next.teamName.toUpperCase().slice(0, 30), show: true };
  }
  return next;
}

// Apply the AI's brand board changes, then hold the jersey to the brand:
// colors the AI introduced that aren't in the palette snap to the nearest
// brand color, fonts follow the brand fonts, and the brand logos stay on.
// Colors the customer picked by hand earlier are left alone.
export function keepOnBrand(current: DesignSpec, next: DesignSpec, brandPatch: unknown): DesignSpec {
  let brand: Brand | null = current.brand;
  const patch = asObject(brandPatch);
  if (patch) {
    const base = brand ?? brandFromSpec(next);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merged = merge(base, patch) as Record<string, any>;
    tidy({ colors: merged.colors });
    if (Array.isArray(merged.extras))
      merged.extras = merged.extras
        .map((c: unknown) => String(c ?? "").trim().toUpperCase())
        .map((c: string) => (c.startsWith("#") ? c : `#${c}`))
        .filter((c: string) => /^#[0-9A-F]{6}$/.test(c))
        .slice(0, 4);
    if (typeof merged.name === "string") merged.name = merged.name.slice(0, 40);
    if (typeof merged.style === "string") merged.style = merged.style.slice(0, 300);
    merged.logos = base.logos; // logos only change through logo generation or the builder
    merged.savedId = base.savedId;
    const r = BrandSchema.safeParse(merged);
    if (r.success) brand = r.data;
    else console.warn("design turn: dropped invalid brand", JSON.stringify(r.error.issues).slice(0, 300));
  }
  if (!brand) return next;
  const out: DesignSpec = { ...next, brand };
  const palette = brandPalette(brand);
  const brandChanged = !!patch && JSON.stringify(brand.colors) !== JSON.stringify(current.brand?.colors);
  const colors = { ...out.colors };
  for (const k of Object.keys(colors) as (keyof DesignSpec["colors"])[]) {
    const c = colors[k].toUpperCase();
    if (palette.includes(c)) continue;
    // a hand-picked color that the AI didn't touch stays, unless the brand itself changed
    if (c === current.colors[k].toUpperCase() && !brandChanged) continue;
    colors[k] = nearestBrandColor(c, palette);
  }
  out.colors = colors;
  out.wordmark = { ...out.wordmark, font: brand.fonts.wordmark };
  out.lettering = { ...out.lettering, numberFont: brand.fonts.number, nameFont: brand.fonts.name };
  const main = brand.logos.main;
  if (main) out.logo = { ...out.logo, url: main.url, source: main.source, prompt: main.prompt };
  if (brand.logos.alternate) out.patches = { ...out.patches, alternate: { ...out.patches.alternate, url: brand.logos.alternate.url } };
  return out;
}

// Links pasted in chat ("here's our site", an Instagram post, an image URL).
// We read the page's preview image, title and theme color so the AI can use
// them as inspiration. Only public http(s) hosts, small and quick.
const URL_RE = /\bhttps?:\/\/[^\s<>"')]+/i;
function isPublicHost(host: string) {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
  }
  return !h.includes(":"); // no raw IPv6
}

export async function readLink(message: string): Promise<{ url: string; image: string | null; note: string } | null> {
  const m = message.match(URL_RE);
  if (!m) return null;
  let url: URL;
  try {
    url = new URL(m[0].replace(/[.,!?]+$/, ""));
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || !isPublicHost(url.hostname)) return null;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ViberseyBot/1.0)", Accept: "text/html,image/*" },
      signal: AbortSignal.timeout(6000),
      redirect: "follow",
    });
    if (!res.ok) return { url: url.href, image: null, note: `(I shared a link, but it couldn't be opened: HTTP ${res.status}.)` };
    const type = res.headers.get("content-type") ?? "";
    if (type.startsWith("image/")) return { url: url.href, image: url.href, note: `(The link is an image; it's attached as inspiration.)` };
    if (!type.includes("html")) return { url: url.href, image: null, note: "" };
    const html = (await res.text()).slice(0, 300_000);
    const meta = (name: string) =>
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1] ??
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${name}["']`, "i"))?.[1] ??
      null;
    const title = meta("og:title") ?? html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1] ?? null;
    const desc = meta("og:description") ?? meta("description");
    const theme = meta("theme-color");
    let image = meta("og:image") ?? meta("twitter:image");
    if (image) {
      try {
        image = new URL(image, url).href;
        if (!/^https?:/.test(image)) image = null;
      } catch {
        image = null;
      }
    }
    const parts = [title && `title "${title.trim()}"`, desc && `description "${desc.trim().slice(0, 200)}"`, theme && `theme color ${theme}`, image && "its preview image is attached"].filter(Boolean);
    return { url: url.href, image, note: parts.length ? `(From the link I shared: ${parts.join("; ")}. Use it as inspiration for the brand.)` : "" };
  } catch {
    return { url: url.href, image: null, note: "(I shared a link, but it couldn't be opened.)" };
  }
}

// "make me a new logo", "generate a different logo", "replace my logo with an eagle"
const ASKS_FOR_AI_LOGO = /\b(generate|create|design|make|draw|new|different|another|replace|redo|ai)\b[^.!?]{0,40}\b(logo|crest|emblem|mascot)\b|\b(logo|crest|emblem|mascot)\b[^.!?]{0,20}\b(instead|replace|redo)\b/i;
// "use this as my logo", "here's our logo", "put my logo on the chest"
const MEANS_ATTACHED_LOGO = /\b(my|our|this|the|attached|uploaded)\s+(team\s+)?(logo|crest|emblem)\b|\b(use|add|put|place)\b[^.!?]{0,30}\b(logo|crest|emblem)\b/i;

export function wantsAiLogo(message: string) {
  if (!ASKS_FOR_AI_LOGO.test(message)) return false;
  const fresh = /\b(new|different|another|generate|create|draw|ai|redo|replace|instead)\b/i;
  if (/\b(my|our|this|attached|uploaded)\s+(own\s+)?logo\b/i.test(message) && !fresh.test(message)) return false;
  // "make the logo bigger" is a resize, not a request for a new logo
  const resize = /\b(bigger|smaller|larger|size|move|position|left|right|center|centre|sleeves?|back|higher|lower)\b/i.test(message);
  return !resize || fresh.test(message);
}

export async function runDesignTurn(input: {
  spec: DesignSpec;
  history: ChatTurn[];
  message: string;
  inspirationImage?: string | null; // data URL or public URL the customer attached
  attachmentIsLogo?: boolean; // the customer marked the attached image as their logo
}) {
  // An image attached in chat and called "my logo" goes on the jersey as is.
  // Otherwise the model would treat it as inspiration and draw its own logo.
  const attachedLogo =
    !!input.inspirationImage &&
    (input.attachmentIsLogo || (MEANS_ATTACHED_LOGO.test(input.message) && !wantsAiLogo(input.message)));
  if (attachedLogo) {
    input = {
      ...input,
      spec: { ...input.spec, logo: { ...input.spec.logo, url: input.inspirationImage!, source: "upload", prompt: null } },
    };
  }

  // a pasted link becomes inspiration: its preview image and a short note
  const link = await readLink(input.message);
  if (link?.image && !input.inspirationImage) input = { ...input, inspirationImage: link.image };

  const userContent: unknown[] = [
    {
      type: "text",
      text:
        (attachedLogo
          ? `${input.message}\n\n(The attached image is my own logo. It is already placed on the jersey; do not generate a logo.)`
          : input.message) + (link?.note ? `\n\n${link.note}` : ""),
    },
  ];
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
  let next = applyPatch(input.spec, args.spec);
  // hold the jersey to the brand board (and apply any brand changes asked for)
  next = keepOnBrand(input.spec, next, args.brand);
  // An uploaded logo is only replaced when the customer clearly asks for a new one.
  if (input.spec.logo.source === "upload" && (attachedLogo || !wantsAiLogo(input.message))) args.logo_prompt = null;
  if (input.spec.logo.source === "upload" && !args.logo_prompt) next.logo = { ...next.logo, url: input.spec.logo.url, source: "upload", prompt: null };
  // Only draw a logo when one was asked for, never on a whim.
  if (args.logo_prompt && input.spec.logo.url && !wantsAiLogo(input.message)) args.logo_prompt = null;

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
        next.logo = { ...next.logo, url: await uploadPublic("artwork", png, "image/png", "logo/"), source: "ai", prompt: args.logo_prompt ?? null };
      })
    );
  }

  // an alternate (shoulder) logo derived from the main logo
  if (args.alt_logo_prompt && !next.brand?.logos.alternate) {
    const reference = next.logo.url ?? undefined;
    const prompt = `${args.alt_logo_prompt}\n\nAn alternate / secondary team logo${reference ? " derived from the attached primary logo, in the same drawing style" : ""}: simpler and more compact so it reads well small as a shoulder or sleeve patch (for example a circular badge, a monogram-free icon, or the mascot's head alone). Bold flat vector style, thick clean outlines, colors ${palette}. Centered on a plain solid pure white (#FFFFFF) background. No text, no letters, no numbers, no mockup.`;
    jobs.push(
      generateImage(prompt, { aspectRatio: "1:1", reference }).then(async (img) => {
        const png = await knockOutBackground(img.bytes);
        const url = await uploadPublic("artwork", png, "image/png", "logo/");
        next.patches = { ...next.patches, alternate: { ...next.patches.alternate, url, show: true } };
        const brand = next.brand ?? brandFromSpec(next);
        next.brand = { ...brand, logos: { ...brand.logos, alternate: { url, source: "ai", prompt: args.alt_logo_prompt ?? null } } };
      })
    );
  }

  const results = await Promise.allSettled(jobs);
  // a logo the AI drew this turn becomes the brand's main logo
  if (next.brand && next.logo.url && next.logo.url !== input.spec.logo.url && next.logo.source) {
    next.brand = { ...next.brand, logos: { ...next.brand.logos, main: { url: next.logo.url, source: next.logo.source, prompt: next.logo.prompt } } };
  }
  const failed = results.filter((r) => r.status === "rejected").length;
  let reply = args.reply;
  if (failed) reply += " (I couldn't generate one of the images this time. Ask me to try again.)";

  return { spec: next, reply, title: args.title ?? null };
}
