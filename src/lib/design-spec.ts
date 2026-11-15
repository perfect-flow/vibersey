import { z } from "zod";
import { SPORTS, STANDARDS, PRODUCTS, defaultProduct, type Sport, type ProductKey } from "./catalog";

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
} as const;
export type FontKey = keyof typeof FONTS;
const fontKeys = Object.keys(FONTS) as [FontKey, ...FontKey[]];

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

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
  }),
  logo: z.object({
    url: z.string().url().nullable().default(null),
    source: z.enum(["upload", "ai"]).nullable().default(null),
    prompt: z.string().nullable().default(null),
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
  }),
  // name/number shown in previews. Orders and team rosters override these.
  sample: z.object({
    name: z.string().max(16).default("PLAYER"),
    number: z.string().max(3).default("00"),
  }),
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
    logo: { url: null, source: null, prompt: null },
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
  });
}

// Normalize a player entry so it fits the template.
export function cleanPlayer(p: Partial<Player>): Player {
  return {
    name: (p.name ?? "").toString().trim().toUpperCase().slice(0, 16),
    number: (p.number ?? "").toString().replace(/[^0-9]/g, "").slice(0, 3),
  };
}
