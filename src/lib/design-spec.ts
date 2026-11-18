import { z } from "zod";
import { SPORTS, STANDARDS, PRODUCTS, LOGO_POSITIONS, PATCH_POSITIONS, defaultProduct, type Sport, type ProductKey } from "./catalog";

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

const ColorsSchema = z.object({
  primary: hex, // body
  secondary: hex, // yoke / panels / stripes
  accent: hex, // trim
  text: hex, // name and number fill
  outline: hex, // name and number outline
});

// A logo image the customer uploaded or the AI drew (transparent PNG).
export const LogoAssetSchema = z.object({
  url: z.string().url(),
  source: z.enum(["upload", "ai"]),
  prompt: z.string().nullable().default(null),
});
export type LogoAsset = z.infer<typeof LogoAssetSchema>;

// The team's brand board: the colors, fonts and logos every edit must keep.
// It travels with the design (spec.brand) and can be saved to the customer's
// library (table brand_boards) to start other jerseys from.
export const BrandSchema = z.object({
  name: z.string().max(40).default(""),
  colors: ColorsSchema,
  // more brand colors the jersey may use (e.g. a third team color)
  extras: z.array(hex).max(4).default([]),
  fonts: z.object({
    wordmark: z.enum(fontKeys).default("graduate"),
    number: z.enum(fontKeys).default("graduate"),
    name: z.enum(fontKeys).default("graduate"),
  }).default({ wordmark: "graduate", number: "graduate", name: "graduate" }),
  // a short style direction, e.g. "minimal, aggressive, 90s throwback"
  style: z.string().max(300).default(""),
  logos: z.object({
    main: LogoAssetSchema.nullable().default(null),
    alternate: LogoAssetSchema.nullable().default(null), // shoulder badge / secondary mark
  }).default({ main: null, alternate: null }),
  // id in the brand library once saved
  savedId: z.string().uuid().nullable().default(null),
});
export type Brand = z.infer<typeof BrandSchema>;

const PatchesSchema = z.object({
  // the brand's alternate logo as a patch (hockey shoulders, baseball sleeve...)
  alternate: z.object({
    show: z.boolean().default(false),
    url: z.string().url().nullable().default(null),
    position: z.enum(PATCH_POSITIONS).default("auto"),
    scale: z.number().min(0.5).max(2).default(1),
  }).default({ show: false, url: null, position: "auto", scale: 1 }),
  // captain / alternate captain letter
  captain: z.object({
    letter: z.enum(["none", "C", "A"]).default("none"),
    position: z.enum(PATCH_POSITIONS).default("auto"),
    style: z.enum(["letter", "patch"]).default("letter"),
    scale: z.number().min(0.5).max(2).default(1),
  }).default({ letter: "none", position: "auto", style: "letter", scale: 1 }),
});
export type Patches = z.infer<typeof PatchesSchema>;
export const DEFAULT_PATCHES: Patches = {
  alternate: { show: false, url: null, position: "auto", scale: 1 },
  captain: { letter: "none", position: "auto", style: "letter", scale: 1 },
};

export const DesignSpecSchema = z.object({
  sport: z.enum(SPORTS),
  // which Printful jersey (see PRODUCTS in catalog.ts)
  product: z.enum(PRODUCTS.map((p) => p.key) as [ProductKey, ...ProductKey[]]),
  teamName: z.string().max(40).default(""),
  colors: ColorsSchema,
  pattern: z.object({
    style: z.enum(["solid", "stripes", "pinstripes", "hoops", "gradient", "artwork"]),
    // AI-generated, text-free background art (style === "artwork")
    artworkUrl: z.string().url().nullable().default(null),
    artworkPrompt: z.string().nullable().default(null),
    opacity: z.number().min(0).max(1).default(1),
  }),
  trim: z.object({
    yoke: z.boolean().default(false), // contrasting shoulder band
    hemStripes: z.boolean().default(false),
    sleeveStripes: z.boolean().default(false),
    // move the stripes up (negative) or down, as a fraction of the front body
    // piece / the sleeve. Hem stripes move together on front and back so they
    // always meet at the side seams.
    hemStripesOffsetY: z.number().min(-0.3).max(0.06).default(0),
    sleeveStripesOffsetY: z.number().min(-0.3).max(0.15).default(0),
  }),
  logo: z.object({
    url: z.string().url().nullable().default(null),
    source: z.enum(["upload", "ai"]).nullable().default(null),
    prompt: z.string().nullable().default(null),
    // where the logo goes; "auto" follows the sport's convention (see LOGO_SPOTS)
    position: z.enum(LOGO_POSITIONS).default("auto"),
    // size multiplier on top of the spot's standard size
    scale: z.number().min(0.5).max(3).default(1),
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
  patches: PatchesSchema.default(DEFAULT_PATCHES),
  brand: BrandSchema.nullable().default(null),
});
export type DesignSpec = z.infer<typeof DesignSpecSchema>;

export type Player = { name: string; number: string };

export function defaultSpec(sport: Sport, product?: ProductKey): DesignSpec {
  const s = STANDARDS[sport];
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
    pattern: { style: sport === "baseball" ? "pinstripes" : "solid", artworkUrl: null, artworkPrompt: null, opacity: 1 },
    trim: { yoke: sport === "hockey", hemStripes: sport === "hockey", sleeveStripes: sport === "football" || sport === "hockey" },
    logo: { url: null, source: null, prompt: null, position: "auto", scale: 1, offsetX: 0, offsetY: 0 },
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
    },
    sample: { name: "PLAYER", number: "23" },
    patches: DEFAULT_PATCHES,
    brand: null,
  });
}

// A brand board seeded from what's on the jersey now.
export function brandFromSpec(spec: DesignSpec): Brand {
  return BrandSchema.parse({
    name: spec.teamName || spec.wordmark.text || "",
    colors: spec.colors,
    extras: [],
    fonts: { wordmark: spec.wordmark.font, number: spec.lettering.numberFont, name: spec.lettering.nameFont },
    style: "",
    logos: {
      main: spec.logo.url && spec.logo.source ? { url: spec.logo.url, source: spec.logo.source, prompt: spec.logo.prompt } : null,
      alternate: spec.patches?.alternate?.url ? { url: spec.patches.alternate.url, source: "upload", prompt: null } : null,
    },
    savedId: null,
  });
}

// Put a brand board on a jersey: its colors, fonts and logos, keeping the
// jersey's own layout. Used when picking a saved brand and by "Apply brand".
export function applyBrand(spec: DesignSpec, brand: Brand): DesignSpec {
  const main = brand.logos.main;
  const alt = brand.logos.alternate;
  const patches = spec.patches ?? DEFAULT_PATCHES;
  return {
    ...spec,
    brand,
    teamName: brand.name || spec.teamName,
    wordmark: { ...spec.wordmark, font: brand.fonts.wordmark, text: brand.name ? brand.name.toUpperCase().slice(0, 30) : spec.wordmark.text },
    colors: { ...brand.colors },
    lettering: { ...spec.lettering, numberFont: brand.fonts.number, nameFont: brand.fonts.name },
    logo: main ? { ...spec.logo, url: main.url, source: main.source, prompt: main.prompt } : spec.logo,
    patches: { ...patches, alternate: { ...patches.alternate, url: alt?.url ?? null, show: alt ? patches.alternate.show || !patches.alternate.url : false } },
  };
}

// Every color the brand allows on the jersey: its five roles, extras, and
// plain white and black, which go with any palette.
export function brandPalette(brand: Brand): string[] {
  const all = [...Object.values(brand.colors), ...brand.extras, "#FFFFFF", "#000000"].map((c) => c.toUpperCase());
  return [...new Set(all)];
}

// The closest brand color to a color (simple RGB distance).
export function nearestBrandColor(color: string, palette: string[]): string {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = rgb(color);
  let best = palette[0];
  let bestD = Infinity;
  for (const p of palette) {
    const [pr, pg, pb] = rgb(p);
    const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (d < bestD) [best, bestD] = [p, d];
  }
  return best;
}

// Normalize a player entry so it fits the template.
export function cleanPlayer(p: Partial<Player>): Player {
  return {
    name: (p.name ?? "").toString().trim().toUpperCase().slice(0, 16),
    number: (p.number ?? "").toString().replace(/[^0-9]/g, "").slice(0, 3),
  };
}
