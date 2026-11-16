// Sample designs for scripts/render-previews.ts. Each one is a customer brief
// turned into a spec the way the designer would.
import { defaultSpec, type DesignSpec } from "../src/lib/design-spec";
import type { Sport } from "../src/lib/catalog";

type Patch = { [k: string]: unknown };
function make(sport: Sport, patch: Patch): DesignSpec {
  const s = defaultSpec(sport) as unknown as Record<string, Record<string, unknown>>;
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof s[k] === "object") s[k] = { ...s[k], ...(v as object) };
    else (s as Record<string, unknown>)[k] = v;
  }
  return s as unknown as DesignSpec;
}

const BEFORE = process.env.SAMPLES === "before";

// "Riverside Hawks, black and gold basketball, our logo"
const hawks = make("basketball", {
  teamName: "Riverside Hawks",
  colors: { primary: "#111111", secondary: "#F5B700", accent: "#F5B700", text: "#F5B700", outline: "#FFFFFF" },
  logo: { url: "sample", source: "upload", position: "auto", scale: 1 },
  wordmark: { show: true, text: "HAWKS", style: "arch", font: "graduate" },
  ...(BEFORE
    ? { pattern: { style: "solid", opacity: 1 } }
    : {
        pattern: { style: "halftone", tone: "contrast", seed: 12, scale: 1, texture: "mesh", opacity: 1 },
        trim: { yoke: false, hemStripes: false, sleeveStripes: false, sidePanels: true },
        colors: { primary: "#111111", secondary: "#F5B700", accent: "#FFFFFF", text: "#F5B700", outline: "#FFFFFF" },
        lettering: { effect: "double" },
        logo: { url: "sample", source: "upload", position: "auto", scale: 1.3, effect: "outline" },
      }),
});

// "Lightning FC, electric blue and yellow soccer kit, something modern"
const lightning = make("soccer", {
  teamName: "Lightning FC",
  colors: { primary: "#0A3D91", secondary: "#1E90FF", accent: "#FFE600", text: "#FFFFFF", outline: "#0A1F4D" },
  logo: { url: "sample", source: "upload", position: "auto", scale: 1 },
  wordmark: { show: true, text: "LIGHTNING", style: "straight", font: "bebas" },
  lettering: { nameFont: "bebas", numberFont: "bebas" },
  ...(BEFORE
    ? { pattern: { style: "gradient", opacity: 1 } }
    : {
        colors: { primary: "#0A3D91", secondary: "#FFE600", accent: "#1E90FF", text: "#FFFFFF", outline: "#0A1F4D" },
        pattern: { style: "lightning", tone: "contrast", seed: 4, scale: 1, texture: "none", opacity: 1 },
        lettering: { effect: "double" },
        logo: { url: "sample", source: "upload", position: "auto", scale: 1.2, effect: "outline" },
      }),
});

// "Ironmen football, red and silver, tough look"
const ironmen = make("football", {
  teamName: "Ironmen",
  colors: { primary: "#B3121B", secondary: "#C0C5CC", accent: "#1A1A1A", text: "#FFFFFF", outline: "#1A1A1A" },
  wordmark: { show: true, text: "IRONMEN", style: "straight", font: "blackops" },
  lettering: { nameFont: "blackops", numberFont: "graduate" },
  ...(BEFORE
    ? { pattern: { style: "solid", opacity: 1 } }
    : {
        pattern: { style: "shards", tone: "tonal", seed: 9, scale: 1, texture: "carbon", opacity: 1 },
        lettering: { effect: "double-shadow" },
      }),
});

// "Polar Bears hockey, ice blue and white, crest on chest"
const polar = make("hockey", {
  teamName: "Polar Bears",
  colors: { primary: "#0E2A47", secondary: "#9FD3F5", accent: "#FFFFFF", text: "#FFFFFF", outline: "#9FD3F5" },
  logo: { url: "sample", source: "upload", position: "auto", scale: 1 },
  ...(BEFORE
    ? { pattern: { style: "solid", opacity: 1 } }
    : {
        pattern: { style: "topo", tone: "tonal", seed: 21, scale: 1, texture: "none", opacity: 1 },
        lettering: { effect: "double" },
        logo: { url: "sample", source: "upload", position: "auto", scale: 1.1, effect: "outline" },
      }),
});

// "Canyon Coyotes baseball, desert sunset colors, retro"
const coyotes = make("baseball", {
  teamName: "Canyon Coyotes",
  colors: { primary: "#F4E9D8", secondary: "#E2582B", accent: "#7A2E8C", text: "#E2582B", outline: "#3B1F4F" },
  wordmark: { show: true, text: "Coyotes", style: "arch", font: "yellowtail" },
  lettering: { nameFont: "graduate", numberFont: "graduate" },
  ...(BEFORE
    ? { pattern: { style: "pinstripes", opacity: 0.5 } }
    : {
        pattern: { style: "waves", tone: "contrast", seed: 2, scale: 1, texture: "none", opacity: 1 },
        lettering: { effect: "shadow" },
      }),
});

// "Venom basketball, black and toxic green, aggressive"
const venom = make("basketball", {
  teamName: "Venom",
  colors: { primary: "#0B0B0B", secondary: "#39FF14", accent: "#1F7A0A", text: "#39FF14", outline: "#0B0B0B" },
  wordmark: { show: true, text: "VENOM", style: "straight", font: "anton" },
  lettering: { nameFont: "anton", numberFont: "anton" },
  ...(BEFORE
    ? { pattern: { style: "stripes", opacity: 0.25 } }
    : {
        pattern: { style: "tiger", tone: "contrast", seed: 5, scale: 1, texture: "none", opacity: 1 },
        lettering: { effect: "double" },
      }),
});

// "Southside Vipers, purple and lime, mean and fast, make us a snake logo".
// The after spec is what the chat model returned for this brief with the new
// prompt; the logo is the image model's output after background knockout.
const vipers = make("basketball", {
  teamName: "Southside Vipers",
  colors: { primary: "#4A148C", secondary: "#C6FF00", accent: "#76FF03", text: "#FFFFFF", outline: "#C6FF00" },
  wordmark: { show: true, text: "VIPERS", style: "arch", font: "blackops" },
  lettering: { nameFont: "blackops", numberFont: "blackops" },
  logo: { url: "sample-ai", source: "ai", position: "auto", scale: 1, effect: BEFORE ? "none" : "outline" },
  ...(BEFORE
    ? { pattern: { style: "solid", opacity: 1 }, trim: { sidePanels: false } }
    : {
        pattern: { style: "lightning", tone: "contrast", seed: 42, scale: 1.3, texture: "carbon", opacity: 1 },
        trim: { yoke: false, hemStripes: false, sleeveStripes: false, sidePanels: true },
        lettering: { nameFont: "blackops", numberFont: "blackops", effect: "double-shadow" },
      }),
});

export const SAMPLES: Record<string, DesignSpec> = { vipers, hawks, lightning, ironmen, polar, coyotes, venom };

// One jersey per procedural graphic, for checking the pattern engine.
const PALETTES = [
  { primary: "#13294B", secondary: "#FF6B00", accent: "#FFFFFF", text: "#FFFFFF", outline: "#FF6B00" },
  { primary: "#1B1B1B", secondary: "#E10600", accent: "#C0C5CC", text: "#FFFFFF", outline: "#E10600" },
  { primary: "#0F5132", secondary: "#F2C14E", accent: "#FFFFFF", text: "#F2C14E", outline: "#0B2E1D" },
  { primary: "#4B1D7A", secondary: "#00E5FF", accent: "#FF2E88", text: "#FFFFFF", outline: "#1A0833" },
];
export const GALLERY: Record<string, DesignSpec> = Object.fromEntries(
  (["sash", "chevron", "halftone", "camo", "shards", "lightning", "topo", "speed", "hex", "tiger", "waves", "fade"] as const).map((style, i) => [
    `pattern-${style}`,
    make((["soccer", "basketball", "football"] as const)[i % 3], {
      teamName: "Vibers",
      colors: PALETTES[i % PALETTES.length],
      pattern: { style, tone: style === "camo" || style === "topo" ? "tonal" : "contrast", seed: 3 + i, scale: 1, texture: "none", opacity: 1 },
      wordmark: { show: true, text: "VIBERS", style: "straight", font: "russo" },
      lettering: { effect: "double", numberFont: "russo", nameFont: "russo" },
      logo: { url: "sample", source: "upload", position: "auto", scale: 1, effect: "outline" },
    }),
  ])
);
