// Alternate colorways for a locked team design (home/away kits). Only the five
// design colors change; layout, graphics, fonts and logo stay exactly the same.
import type { DesignSpec } from "./design-spec";

export type Colors = DesignSpec["colors"];
export const COLOR_KEYS = ["primary", "secondary", "accent", "text", "outline"] as const;
export const COLOR_LABELS: Record<(typeof COLOR_KEYS)[number], string> = {
  primary: "Body",
  secondary: "Second color",
  accent: "Accent",
  text: "Numbers & names",
  outline: "Number outline",
};

export const COLORWAY_PRESETS = {
  white: { label: "White", hint: "Classic away: white body, team colors on the trim and numbers" },
  dark: { label: "Black", hint: "Blackout alternate with team-color accents" },
  swap: { label: "Swapped", hint: "Second color becomes the body color" },
} as const;
export type ColorwayPreset = keyof typeof COLORWAY_PRESETS;

const WHITE = "#FFFFFF";
const BLACK = "#141414";

function rgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
const near = (a: string, b: string) => contrast(a, b) < 1.25;

// The candidate that stands out most against the body, preferring earlier ones
// (team colors) when they are readable.
function readableOn(body: string, candidates: string[], min = 3) {
  const unique = candidates.filter((c, i) => candidates.indexOf(c) === i && !near(c, body));
  return unique.find((c) => contrast(c, body) >= min) ?? [...unique, WHITE, BLACK].sort((a, b) => contrast(b, body) - contrast(a, body))[0];
}
// An outline that separates the lettering from the body.
function outlineFor(body: string, text: string, candidates: string[]) {
  return candidates.filter((c) => !near(c, text) && !near(c, body))[0] ?? (luminance(text) > 0.5 ? BLACK : WHITE);
}

export function colorway(base: Colors, preset: ColorwayPreset): Colors {
  const team = [base.primary, base.secondary, base.accent, base.outline, base.text].map((c) => c.toUpperCase());
  // the team's strongest colors: not white, not black-ish duplicates of the new body
  if (preset === "white") {
    const primary = WHITE;
    const strong = team.filter((c) => luminance(c) < 0.8);
    const text = readableOn(primary, strong);
    const secondary = strong[0] ?? text; // trim in the team's main color
    const accent = strong.find((c) => c !== secondary) ?? secondary;
    return { primary, secondary, accent, text, outline: outlineFor(primary, text, [secondary, accent, ...strong]) };
  }
  if (preset === "dark") {
    const primary = BLACK;
    const visible = team.filter((c) => !near(c, primary) && luminance(c) > 0.02);
    // real team colors before white
    const bright = [...visible.filter((c) => luminance(c) < 0.85), ...visible.filter((c) => luminance(c) >= 0.85)];
    const secondary = bright[0] ?? base.secondary;
    const accent = bright.find((c) => c !== secondary) ?? base.accent;
    const text = readableOn(primary, [base.text, WHITE, ...bright]);
    return { primary, secondary, accent, text, outline: outlineFor(primary, text, [secondary, accent, ...bright]) };
  }
  // swap
  const primary = base.secondary;
  const secondary = base.primary;
  const text = readableOn(primary, [base.primary, base.text, base.accent, base.outline]);
  return { primary, secondary, accent: base.accent, text, outline: outlineFor(primary, text, [base.outline, base.text, base.accent, base.primary]) };
}

// The only change a kit may make to a team design: its colors.
export function applyColors(spec: DesignSpec, colors: Colors): DesignSpec {
  return { ...spec, colors: { ...colors } };
}
