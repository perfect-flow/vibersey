import { z } from "zod";
import { SPORTS, STANDARDS, PRODUCTS, LOGO_POSITIONS, defaultProduct, type Sport, type ProductKey } from "./catalog";

// Fonts bundled in /public/fonts. The same files are used for the browser
// preview and for the server-side print-file render, so what the customer sees
// is exactly what gets printed.
export const FONTS = {
  graduate: { family: "Graduate", file: "Graduate.ttf", label: "Varsity block" },
  bebas: { family: "Bebas Neue", file: "BebasNeue.ttf", label: "Bebas condensed" },
  oswald: { family: "Oswald", file: "Oswald-Bold.ttf", label: "Oswald bold", weight: 700 },
  anton: { family: "Anton", file: "Anton.ttf", label: "Anton heavy" },
  teko: { family: "Teko", file: "Teko-Bold.ttf", label: "Teko athletic", weight: 700 },
  yellowtail: { family: "Yellowtail", file: "Yellowtail.ttf", label: "Script" },
  blackops: { family: "Black Ops One", file: "BlackOpsOne.ttf", label: "Stencil block" },
  alfaslab: { family: "Alfa Slab One", file: "AlfaSlabOne.ttf", label: "Slab serif" },
  bowlby: { family: "Bowlby One SC", file: "BowlbyOneSC.ttf", label: "Heavy block" },
  bungee: { family: "Bungee", file: "Bungee.ttf", label: "Bungee block" },
  russo: { family: "Russo One", file: "RussoOne.ttf", label: "Russo athletic" },
  staatliches: { family: "Staatliches", file: "Staatliches.ttf", label: "Staatliches" },
  squada: { family: "Squada One", file: "SquadaOne.ttf", label: "Squared" },
  racing: { family: "Racing Sans One", file: "RacingSansOne.ttf", label: "Racing italic" },
  kanit: { family: "Kanit", file: "Kanit-ExtraBoldItalic.ttf", label: "Speed italic", weight: 800, italic: true },
  rubikmono: { family: "Rubik Mono One", file: "RubikMonoOne.ttf", label: "Wide block" },
  marker: { family: "Permanent Marker", file: "PermanentMarker.ttf", label: "Brush marker" },
  pacifico: { family: "Pacifico", file: "Pacifico.ttf", label: "Retro script" },
} as const;
export type FontKey = keyof typeof FONTS;
const fontKeys = Object.keys(FONTS) as [FontKey, ...FontKey[]];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

// Background graphics. The first six are the original styles; the rest are
// procedural sublimation graphics drawn by src/lib/patterns.ts.
export const PATTERN_STYLES = {
  solid: "flat body color",
  stripes: "bold vertical stripes",
  pinstripes: "thin classic pinstripes",
  hoops: "horizontal hoops",
  gradient: "vertical fade from primary to secondary",
  artwork: "AI-generated full-bleed image (set artwork_prompt)",
  sash: "bold diagonal band shoulder to hip with pinlines (front; echoed on back)",
  chevron: "big V band across the torso below the numbers",
  halftone: "halftone dots that grow toward the hem over a fade",
  camo: "digital camo pixels",
  shards: "low-poly geometric shards, faceted",
  lightning: "glowing lightning bolts down the sides",
  topo: "topographic contour lines",
  speed: "angled speed streaks from the sides",
  hex: "honeycomb hexagons fading in toward the hem",
  tiger: "tapered tiger/claw stripes from the side seams",
  waves: "flowing wave ribbons across the lower body",
  fade: "diagonal color fade from primary into the graphic color",
} as const;
export type PatternStyle = keyof typeof PATTERN_STYLES;
const patternKeys = Object.keys(PATTERN_STYLES) as [PatternStyle, ...PatternStyle[]];

export const LETTERING_EFFECTS = ["single", "double", "shadow", "double-shadow"] as const;
export const LOGO_EFFECTS = ["none", "outline", "shadow"] as const;

export const DesignSpecSchema = z.object({
  sport: z.enum(SPORTS),
  // which Printful jersey (see PRODUCTS in catalog.ts)
  product: z.enum(PRODUCTS.map((p) => p.key) as [ProductKey, ...ProductKey[]]),
  teamName: z.string().max(40).default(""),
  colors: z.object({
    primary: hex, // body
    secondary: hex, // yoke / panels / stripes
    accent: hex, // trim
    text: hex, // name and number fill
    outline: hex, // name and number outline
  }),
  pattern: z.object({
    style: z.enum(patternKeys),
    // AI-generated, text-free background art (style === "artwork")
    artworkUrl: z.string().url().nullable().default(null),
    artworkPrompt: z.string().nullable().default(null),
    opacity: z.number().min(0).max(1).default(1),
    // procedural graphics: "contrast" uses secondary/accent, "tonal" uses shades of primary
    tone: z.enum(["contrast", "tonal"]).default("contrast"),
    seed: z.number().int().min(1).max(999999).default(1), // same seed = same graphic
    scale: z.number().min(0.5).max(2).default(1), // feature size
    texture: z.enum(["none", "mesh", "carbon"]).default("none"), // fine fabric overlay
  }),
  trim: z.object({
    yoke: z.boolean().default(false), // contrasting shoulder band
    hemStripes: z.boolean().default(false),
    sleeveStripes: z.boolean().default(false),
    sidePanels: z.boolean().default(false), // contrasting panels down the side seams
  }),
  logo: z.object({
    url: z.string().url().nullable().default(null),
    source: z.enum(["upload", "ai"]).nullable().default(null),
    prompt: z.string().nullable().default(null),
    // where the logo goes; "auto" follows the sport's convention (see LOGO_SPOTS)
    position: z.enum(LOGO_POSITIONS).default("auto"),
    // size multiplier on top of the spot's standard size
    scale: z.number().min(0.5).max(3).default(1),
    // outline = a sticker-style border so the logo pops off busy graphics
    effect: z.enum(LOGO_EFFECTS).default("none"),
    // customer's nudge from the spot, as a fraction of the fabric piece
    offsetX: z.number().min(-0.5).max(0.5).default(0),
    offsetY: z.number().min(-0.5).max(0.5).default(0),
  }),
  wordmark: z.object({
    show: z.boolean().default(true),
    text: z.string().max(30).default(""),
    style: z.enum(["arch", "straight"]).default("arch"),
    font: z.enum(fontKeys).default("graduate"),
  }),
  lettering: z.object({
    nameFont: z.enum(fontKeys).default("graduate"),
    numberFont: z.enum(fontKeys).default("graduate"),
    showName: z.boolean(),
    numberFront: z.boolean(),
    numberBack: z.boolean(),
    numberSleeves: z.boolean(),
    outlineWidth: z.number().min(0).max(0.2).default(0.06), // fraction of glyph height
    // double = pro two-color outline (accent inside, outline color outside)
    effect: z.enum(LETTERING_EFFECTS).default("single"),
    // customer's size and height adjustments; offsets are fractions of the piece
    numberScale: z.number().min(0.5).max(1.6).default(1),
    numberOffsetY: z.number().min(-0.3).max(0.3).default(0),
    nameScale: z.number().min(0.5).max(1.8).default(1),
    nameOffsetY: z.number().min(-0.3).max(0.3).default(0),
  }),
  // name/number shown in previews. Orders and team rosters override these.
  sample: z.object({
    name: z.string().max(16).default("PLAYER"),
    number: z.string().max(3).default("00"),
  }),
});
export type DesignSpec = z.infer<typeof DesignSpecSchema>;

export type Player = { name: string; number: string };

// A strong starting look per sport, so the very first preview already looks
// like a real sublimated kit.
const STARTER_PATTERN: Record<Sport, { style: PatternStyle; tone: "contrast" | "tonal"; texture: "none" | "mesh" | "carbon" }> = {
  baseball: { style: "pinstripes", tone: "contrast", texture: "none" },
  basketball: { style: "halftone", tone: "contrast", texture: "mesh" },
  football: { style: "shards", tone: "tonal", texture: "none" },
  hockey: { style: "solid", tone: "contrast", texture: "none" },
  soccer: { style: "speed", tone: "tonal", texture: "none" },
};

export function defaultSpec(sport: Sport, product?: ProductKey, seed = 1 + Math.floor(Math.random() * 999998)): DesignSpec {
  const s = STANDARDS[sport];
  const starter = STARTER_PATTERN[sport];
  return DesignSpecSchema.parse({
    sport,
    product: product ?? defaultProduct(sport).key,
    teamName: "",
    colors: {
      primary: "#0B1F3A",
      secondary: "#FFFFFF",
      accent: "#E63946",
      text: "#FFFFFF",
      outline: "#E63946",
    },
    pattern: { ...starter, artworkUrl: null, artworkPrompt: null, opacity: sport === "baseball" ? 0.6 : 1, seed, scale: 1 },
    trim: {
      yoke: sport === "hockey",
      hemStripes: sport === "hockey",
      sleeveStripes: sport === "football" || sport === "hockey",
      sidePanels: sport === "basketball",
    },
    logo: { url: null, source: null, prompt: null, position: "auto", scale: 1, offsetX: 0, offsetY: 0, effect: "none" },
    wordmark: {
      show: sport !== "hockey",
      text: "TEAM",
      style: sport === "soccer" ? "straight" : "arch",
      font: sport === "baseball" ? "yellowtail" : "graduate",
    },
    lettering: {
      nameFont: "graduate",
      numberFont: "graduate",
      showName: s.nameDefault,
      numberFront: s.numbersDefault.front,
      numberBack: s.numbersDefault.back,
      numberSleeves: s.numbersDefault.sleeves,
      outlineWidth: 0.06,
      effect: sport === "baseball" ? "shadow" : "double",
    },
    sample: { name: "PLAYER", number: "23" },
  });
}

// Normalize a player entry so it fits the template.
export function cleanPlayer(p: Partial<Player>): Player {
  return {
    name: (p.name ?? "").toString().trim().toUpperCase().slice(0, 16),
    number: (p.number ?? "").toString().replace(/[^0-9]/g, "").slice(0, 3),
  };
}
