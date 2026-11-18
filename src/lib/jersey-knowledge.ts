// What a jersey designer knows, written for the AI designer's system prompt:
// how pro jerseys are put together, how to describe them with Vibersey's
// vector graphics (graphics.ts), and a set of proven recipes to start from.

import type { Sport } from "./catalog";
import type { Graphic } from "./graphics";

export const DESIGN_PRINCIPLES = `How pro jerseys are designed (follow these like a kit designer at a pro league would):
- A jersey is built from a few big, confident shapes, not busy textures. One dominant body color, one strong secondary color, and one or two trim colors (often white plus a metallic or bright accent). 3 colors is classic, 4 is the max for most teams.
- Structure first: decide the body treatment (solid, two-tone split, yoke, sash, side panels), then trim (hem stripes, sleeve stripes, outlined edges), then identity (crest, wordmark, numbers).
- Outlined trim is what makes a jersey look pro: a body split or yoke edge almost always has one or two thin trim lines (e.g. a white line then a gold line) between the two big colors. Trim lines are thin: 0.008 to 0.025 each.
- Stripe sets are balanced and repeated: the same stripe pattern at the hem and on the sleeves (sleeve stripes a bit thinner), symmetric (thick-thin-thick, or thin-thick-thin). Typical hockey hem set: 0.035 / 0.018 / 0.035 with 0.008 gaps.
- Front, back and sleeves belong together: sleeves echo the body (same stripe set, or the lower body color carried onto the forearm with the same trim). The back is usually simpler than the front: a straight split at the same side height, so the name and number sit on a clean field.
- Keep a clean, high-contrast field where the crest, team name and numbers go. Never run a busy shape behind the number; numbers are always the text color with a contrasting outline.
- Classic looks: hockey = yoke + hem stripes + sleeve stripes, crest centered; 90s/retro = bold diagonal or chevron splits, star or lightning cuts, wide outlined trim; modern = clean asymmetric diagonal, tonal panels, minimal trim; baseball = pinstripes or solid with piping and a script wordmark on a slight rising angle (wordmark.style "diagonal"); football = sleeve/shoulder stripes (the "Northwestern" stripes), big block numbers; soccer = a sash, hoops, vertical stripes, or a bold chest band; basketball = side panels and a chest wordmark with the number below.`;

export const GRAPHICS_GUIDE = `Jersey graphics (spec.graphics): the body treatment is a list of vector parts drawn in order (later parts on top). Colors are a color ROLE name ("primary", "secondary", "accent", "text", "outline") or a "#RRGGBB" hex. Prefer roles so team kits and brand changes recolor the jersey. Coordinates are fractions of the fabric piece: x 0 = left side seam, 1 = right side seam; y 0 = top of the body piece, 1 = the hem. Give every part a short unique id. Each part may have hidden: true.
- panel: a body region split off by a shaped edge. edge: straight | chevron | diagonal | double_chevron | star_point | wave | zigzag | custom. side: "below" (fill under the edge, the usual choice) or "above". y: height of the edge at the body's center (0.35-0.65 is typical). depth: shape amplitude (positive = the center is higher than the sides, a ^ point; negative = a V; for diagonal it is the tilt, left-to-right drop). star_point = a center point rising between two valleys with the sides high, the classic 90s star cut. custom: points [[x,y],...] from x=0 to x=1 to trace any edge you see in an inspiration image (up to 16 points). color: the fill. trim: outlined edging from the fill outward, e.g. [{"color":"accent","width":0.02},{"color":"text","width":0.012}]. front (true/false), back ("same" mirrored shape, "straight" at the side height, or "none"), sleeves (true: carry the fill onto both forearms as a straight band from sleeveY, with the same trim), sleeveY (0.5-0.75).
- stripes: horizontal stripe set. area "body" (around the torso; drawn at the same height on front and back so they meet at the side seams) or "sleeves" (around both arms). y: top of the set (body hem stripes ~0.76-0.84, chest band ~0.3-0.45; long hockey sleeves ~0.6-0.7, short sleeves ~0.65-0.8). bands: [{color, width, gap}] top to bottom. front/back booleans for body sets.
- yoke: contrasting shoulders. On hockey and American football jerseys it colors the separate shoulder piece (trim then becomes piping on the seam below it). On others: depth (0.1-0.25), shape straight | curved | pointed, trim along its lower edge, sleeves true to color the sleeve caps.
- sash: diagonal band across the front: from (center height at the left side) and to (at the right side), width (0.06-0.2), color, trim, back true/false.
- side_panels: vertical panels down both sides: width (fraction of body width, 0.08-0.2), top (where they start, ~0.15-0.3), taper (0-1), color, trim, back true/false.
- pattern.style (solid, stripes, pinstripes, hoops, gradient) is the base fill under the graphics. Usually "solid".`;

// Proven starting points, in role colors.
const R = (g: Record<string, unknown>) => g as unknown as Graphic;
export const RECIPES: { name: string; when: string; graphics: Graphic[] }[] = [
  {
    name: "Classic hockey",
    when: "traditional, original-six, clean pro look",
    graphics: [
      R({ id: "yoke", kind: "yoke", color: "secondary", sleeves: true, depth: 0.14, shape: "straight", trim: [] }),
      R({ id: "hem", kind: "stripes", area: "body", y: 0.78, bands: [{ color: "secondary", width: 0.035, gap: 0.008 }, { color: "accent", width: 0.018, gap: 0.008 }, { color: "secondary", width: 0.035, gap: 0 }] }),
      R({ id: "sleeve", kind: "stripes", area: "sleeves", y: 0.64, bands: [{ color: "secondary", width: 0.05, gap: 0.012 }, { color: "accent", width: 0.025, gap: 0.012 }, { color: "secondary", width: 0.05, gap: 0 }] }),
    ],
  },
  {
    name: "Star cut two-tone (90s)",
    when: "two-tone body split by a pointed star/chevron cut with outlined edging; very common in 90s hockey",
    graphics: [
      R({ id: "lower", kind: "panel", edge: "star_point", side: "below", y: 0.5, depth: 0.24, color: "secondary", trim: [{ color: "accent", width: 0.022 }, { color: "text", width: 0.012 }], back: "straight", sleeves: true, sleeveY: 0.6 }),
    ],
  },
  {
    name: "Chevron split",
    when: "bold modern or retro look with a big V or ^ across the chest",
    graphics: [
      R({ id: "chev", kind: "panel", edge: "chevron", side: "below", y: 0.42, depth: -0.14, color: "secondary", trim: [{ color: "text", width: 0.014 }, { color: "accent", width: 0.014 }], back: "straight", sleeves: true, sleeveY: 0.62 }),
      R({ id: "hem", kind: "stripes", area: "body", y: 0.86, bands: [{ color: "accent", width: 0.02, gap: 0.01 }, { color: "text", width: 0.012, gap: 0 }] }),
    ],
  },
  {
    name: "Diagonal sash",
    when: "soccer/throwback, asymmetric energy",
    graphics: [R({ id: "sash", kind: "sash", from: 0.12, to: 0.82, width: 0.14, color: "secondary", trim: [{ color: "accent", width: 0.012 }], back: false })],
  },
  {
    name: "Lightning cut",
    when: "aggressive, electric, fast",
    graphics: [R({ id: "bolt", kind: "panel", edge: "zigzag", side: "below", y: 0.6, depth: 0.12, color: "secondary", trim: [{ color: "accent", width: 0.02 }], back: "same", sleeves: true, sleeveY: 0.65 })],
  },
  {
    name: "Side panels",
    when: "basketball and modern athletic cuts",
    graphics: [R({ id: "sides", kind: "side_panels", width: 0.12, top: 0.18, taper: 0.3, color: "secondary", trim: [{ color: "accent", width: 0.012 }], back: true })],
  },
  {
    name: "Shoulder stripes (football)",
    when: "classic football sleeves",
    graphics: [R({ id: "sleeve", kind: "stripes", area: "sleeves", y: 0.55, bands: [{ color: "text", width: 0.07, gap: 0.04 }, { color: "text", width: 0.07, gap: 0 }] })],
  },
];

export function recipesText() {
  return RECIPES.map((r) => `- ${r.name} (${r.when}): ${JSON.stringify(r.graphics)}`).join("\n");
}

export const INSPIRATION_GUIDE = `Inspiration images: when the customer attaches a jersey or design for inspiration, NEVER paste, trace or reproduce the image itself, and never ask the image model to copy it. Read it like a kit designer and rebuild its STRUCTURE with graphics:
1. Fill "inspiration_read" first, in jersey vocabulary: body color(s) and where they split (shape of the edge: chevron, star point, diagonal, straight, with rough heights), trim lines along edges (colors and order from the inside out), yoke, stripe sets (where, how many, thick/thin pattern), sleeve treatment, back treatment, crest placement and size, wordmark (arched/straight/diagonal, where), number placement.
2. Map their colors onto the customer's colors (keep the same light/dark relationships: if the inspiration's lower body is the darkest color, use the customer's darkest color there).
3. Recreate the shapes with panel/stripes/yoke/sash parts. Use edge "custom" with points when no preset matches the cut closely; trace the edge's turning points from left seam to right seam.
4. Layout and style may be borrowed; a real team's trademarked logo, name or wordmark must not be. If the inspiration has a famous crest (e.g. a star), describe an ORIGINAL crest for logo_prompt only if the customer asks for a logo.
5. In your reply, briefly say what you took from it ("two-tone body with a star cut and white/gold edging, carried onto the sleeves").`;

export function sportExtras(sport: Sport): string {
  switch (sport) {
    case "hockey":
      return "Hockey specifics: the crest is the hero, centered on the chest, roughly 25-30% of the chest width or larger; no front number. Numbers on the back and on both upper sleeves (above the elbow stripes). Hem stripes sit low (y ~0.76-0.84). Captain C/A on the upper chest. Lace-up or V collars in the trim color.";
    case "baseball":
      return "Baseball specifics: script or arched wordmark across the chest (style \"diagonal\" for a rising script), small front number lower left, piping and pinstripes are classic, sleeve patches.";
    case "basketball":
      return "Basketball specifics: tank top. Chest wordmark with a big number centered below it; side panels and contrasting trim at neck and arm holes; keep the center chest clean.";
    case "football":
      return "Football specifics: huge block numbers front and back with outlines, smaller sleeve or shoulder numbers, sleeve stripes, a small logo near the collar.";
    case "soccer":
      return "Soccer specifics: crest on the wearer's left chest, a bold body graphic (sash, hoops, chest band, vertical stripes or a tonal pattern), small number front optional, name and number on the back.";
  }
}
