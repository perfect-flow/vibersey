// Sports Vibersey supports, the layout standards the renderer and the AI
// designer follow for each sport, and the Printful products offered.
//
// The admin sync route (/api/admin/sync-catalog) looks each product up in the
// Printful API (by id, or by exact title when the id is 0) and caches its exact
// variants, costs and print-file sizes in the `products` table. The defaults
// below are only used until that sync has run.

export const SPORTS = ["baseball", "basketball", "football", "hockey", "soccer"] as const;
export type Sport = (typeof SPORTS)[number];

// "yoke" is the separate shoulder piece some jerseys (hockey, American
// football) are sewn from.
export type Placement = "front" | "back" | "sleeve_left" | "sleeve_right" | "yoke";

export type LayoutBox = {
  // normalized to the fabric piece inside the print panel (see garments.ts):
  // 0..1 from the piece's top-left corner
  x: number; // center x
  y: number; // center y
  h: number; // text cap height / logo height as a fraction of panel height
  w?: number; // max width as fraction of panel width
};

export type SportStandard = {
  label: string;
  // what goes where, by sport convention
  layout: Partial<Record<Placement, {
    wordmark?: LayoutBox;
    number?: LayoutBox;
    name?: LayoutBox;
  }>>;
  numbersDefault: { front: boolean; back: boolean; sleeves: boolean };
  nameDefault: boolean;
  // short guidance injected into the AI system prompt
  guidance: string;
};

export const STANDARDS: Record<Sport, SportStandard> = {
  baseball: {
    label: "Baseball",
    layout: {
      front: {
        wordmark: { x: 0.5, y: 0.42, h: 0.085, w: 0.62 },
        number: { x: 0.36, y: 0.56, h: 0.065 },
      },
      back: {
        name: { x: 0.5, y: 0.2, h: 0.045, w: 0.6 },
        number: { x: 0.5, y: 0.38, h: 0.22 },
      },
    },
    numbersDefault: { front: true, back: true, sleeves: false },
    nameDefault: true,
    guidance:
      "Baseball: button-front look. Team wordmark across the chest, classically a script or arched varsity font with a tail swoosh optional. Small number on the lower left chest. Back has player name arched or straight above a large number. Pinstripes, piping and sleeve patches are classic. Keep the chest area clean behind the wordmark.",
  },
  basketball: {
    label: "Basketball",
    layout: {
      front: {
        wordmark: { x: 0.5, y: 0.37, h: 0.065, w: 0.6 },
        number: { x: 0.5, y: 0.56, h: 0.17 },
      },
      back: {
        name: { x: 0.5, y: 0.2, h: 0.045, w: 0.55 },
        number: { x: 0.5, y: 0.4, h: 0.22 },
      },
    },
    numbersDefault: { front: true, back: true, sleeves: false },
    nameDefault: true,
    guidance:
      "Basketball: sleeveless tank. Team name arched or straight across the chest with the number centered below it. Back: player name above a large number. Side panels and trim at neck and arm holes are common. Numbers must be high contrast with an outline.",
  },
  football: {
    label: "Football",
    layout: {
      front: {
        wordmark: { x: 0.5, y: 0.24, h: 0.04, w: 0.4 },
        number: { x: 0.5, y: 0.45, h: 0.26 },
      },
      back: {
        name: { x: 0.5, y: 0.17, h: 0.045, w: 0.6 },
        number: { x: 0.5, y: 0.42, h: 0.3 },
      },
      sleeve_left: { number: { x: 0.5, y: 0.45, h: 0.3, w: 0.7 } },
      sleeve_right: { number: { x: 0.5, y: 0.45, h: 0.3, w: 0.7 } },
    },
    numbersDefault: { front: true, back: true, sleeves: true },
    nameDefault: true,
    guidance:
      "Football: very large block numbers front and back, smaller numbers on the sleeves or shoulders. Small team name or logo near the collar. Back: player name in block letters above the number. Sleeve stripes are classic. Numbers use block/varsity fonts with a contrasting outline.",
  },
  hockey: {
    label: "Hockey",
    layout: {
      // team name across the chest; with a crest it moves below it (render.ts)
      front: { wordmark: { x: 0.5, y: 0.38, h: 0.08, w: 0.72 } },
      back: {
        name: { x: 0.5, y: 0.18, h: 0.045, w: 0.6 },
        number: { x: 0.5, y: 0.4, h: 0.24 },
      },
      // below the shoulder piece, above the elbow stripes
      sleeve_left: { number: { x: 0.5, y: 0.43, h: 0.17, w: 0.5 } },
      sleeve_right: { number: { x: 0.5, y: 0.43, h: 0.17, w: 0.5 } },
    },
    numbersDefault: { front: false, back: true, sleeves: true },
    nameDefault: true,
    guidance:
      "Hockey: a large crest logo centered on the chest, no front number. A team name across the chest is optional (some teams use it instead of a crest); with a crest it sits below it. Horizontal stripes at the waist hem and on the sleeves are traditional. Back: player name above a large number; numbers also on both sleeves above the elbow. Shoulder yoke in a contrasting color is common.",
  },
  soccer: {
    label: "Soccer",
    layout: {
      front: {
        wordmark: { x: 0.5, y: 0.42, h: 0.06, w: 0.55 },
        number: { x: 0.34, y: 0.27, h: 0.06 },
      },
      back: {
        name: { x: 0.5, y: 0.17, h: 0.04, w: 0.6 },
        number: { x: 0.5, y: 0.37, h: 0.22 },
      },
    },
    numbersDefault: { front: true, back: true, sleeves: false },
    nameDefault: true,
    guidance:
      "Soccer: club crest on the left chest (wearer's left, which is the viewer's right), a centered sponsor or team wordmark across the chest, optional small number on the right chest. Back: player name above a large number. Modern kits use bold graphic patterns, gradients, or subtle tonal textures.",
  },
};

// Where a team logo can go. Boxes are normalized to the panel like LayoutBox.
// "left_chest" is the wearer's left, which is the viewer's right.
export const LOGO_POSITIONS = ["auto", "above_name", "center_chest", "left_chest", "right_chest", "sleeves", "upper_back"] as const;
export type LogoPosition = (typeof LOGO_POSITIONS)[number];

// Spots marked anchorTop start just below the neckline of the actual jersey.
export const LOGO_SPOTS: Record<Exclude<LogoPosition, "auto">, Partial<Record<Placement, LayoutBox>> & { anchorTop?: boolean }> = {
  above_name: { front: { x: 0.5, y: 0.155, h: 0.11, w: 0.3 }, anchorTop: true },
  center_chest: { front: { x: 0.5, y: 0.34, h: 0.26, w: 0.62 } },
  left_chest: { front: { x: 0.67, y: 0.24, h: 0.13, w: 0.26 } },
  right_chest: { front: { x: 0.33, y: 0.24, h: 0.13, w: 0.26 } },
  sleeves: { sleeve_left: { x: 0.5, y: 0.4, h: 0.32, w: 0.7 }, sleeve_right: { x: 0.5, y: 0.4, h: 0.32, w: 0.7 } },
  upper_back: { back: { x: 0.5, y: 0.08, h: 0.07, w: 0.3 } },
};

// The sport's usual logo spot, used when the position is "auto".
export const DEFAULT_LOGO_POSITION: Record<Sport, Exclude<LogoPosition, "auto">> = {
  baseball: "above_name",
  basketball: "above_name",
  football: "above_name",
  hockey: "center_chest",
  soccer: "left_chest",
};

export type ProductKey =
  | "baseball-recycled"
  | "basketball-premium"
  | "basketball-recycled"
  | "basketball-youth"
  | "football-american"
  | "football-boxy"
  | "soccer-recycled"
  | "soccer-youth"
  | "hockey-recycled";

export type ProductDef = {
  key: ProductKey;
  sport: Sport;
  label: string; // shown in the product picker
  title: string; // exact Printful catalog title, used to resolve the id
  printfulProductId: number; // 0 = resolve by title during sync
  audience: "adult" | "youth";
  placements: Placement[];
  // youth version teams can mix into the same order (same design, youth sizes)
  youthKey?: ProductKey;
  dashboardUrl: string;
  // where this jersey's cut differs from the sport's usual layout
  layout?: SportStandard["layout"];
  logoSpots?: Partial<Record<Exclude<LogoPosition, "auto">, Partial<Record<Placement, LayoutBox>>>>;
};

const DASH = "https://www.printful.com/dashboard/custom";
const SLEEVED: Placement[] = ["front", "back", "sleeve_left", "sleeve_right"];
const TANK: Placement[] = ["front", "back"];

// The jerseys Vibersey sells, exactly as listed by the owner.
export const PRODUCTS: ProductDef[] = [
  {
    key: "baseball-recycled", sport: "baseball", label: "Recycled baseball jersey", audience: "adult",
    title: "All-Over Print Recycled Unisex Baseball Jersey", printfulProductId: 792, placements: SLEEVED,
    dashboardUrl: `${DASH}/mens/all-over-shirts/all-over-print-recycled-unisex-baseball-jersey`,
  },
  {
    key: "basketball-premium", sport: "basketball", label: "Premium basketball jersey", audience: "adult",
    title: "All-Over Print Premium Basketball Jersey", printfulProductId: 835, placements: TANK,
    youthKey: "basketball-youth",
    dashboardUrl: `${DASH}/mens/tank-tops/all-over-print-premium-basketball-jersey`,
  },
  {
    key: "basketball-recycled", sport: "basketball", label: "Recycled basketball jersey", audience: "adult",
    title: "All-Over Print Recycled Unisex Basketball Jersey", printfulProductId: 0, placements: TANK,
    youthKey: "basketball-youth",
    dashboardUrl: `${DASH}/mens/tank-tops/all-over-print-recycled-unisex-basketball-jersey`,
  },
  {
    key: "basketball-youth", sport: "basketball", label: "Youth basketball jersey", audience: "youth",
    title: "All-Over Print Youth Recycled Basketball Jersey", printfulProductId: 0, placements: TANK,
    dashboardUrl: `${DASH}/kids-teen/all-over-shirts/all-over-print-youth-recycled-basketball-jersey`,
  },
  {
    key: "football-american", sport: "football", label: "American football jersey", audience: "adult",
    title: "All-Over Print American Football Jersey", printfulProductId: 0, placements: [...SLEEVED, "yoke"],
    dashboardUrl: `${DASH}/mens/all-over-shirts/all-over-print-american-football-jersey`,
  },
  {
    key: "football-boxy", sport: "football", label: "Boxy football jersey", audience: "adult",
    title: "All-Over Print Boxy Football Jersey", printfulProductId: 0, placements: SLEEVED,
    // the front is two pieces joined by a seam across the upper chest
    layout: { front: { wordmark: { x: 0.5, y: 0.41, h: 0.04, w: 0.4 }, number: { x: 0.5, y: 0.6, h: 0.25 } } },
    logoSpots: { above_name: { front: { x: 0.5, y: 0.3, h: 0.065, w: 0.22 } } },
    dashboardUrl: `${DASH}/mens/t-shirts/all-over-print-boxy-football-jersey`,
  },
  {
    key: "soccer-recycled", sport: "soccer", label: "Recycled sports jersey", audience: "adult",
    title: "All-Over Print Recycled Unisex Sports Jersey", printfulProductId: 0, placements: SLEEVED,
    youthKey: "soccer-youth",
    dashboardUrl: `${DASH}/mens/t-shirts/all-over-print-recycled-unisex-sports-jersey`,
  },
  {
    key: "soccer-youth", sport: "soccer", label: "Youth sports jersey", audience: "youth",
    title: "All-Over Print Youth Recycled Sports Jersey", printfulProductId: 0, placements: SLEEVED,
    dashboardUrl: `${DASH}/kids-teen/t-shirts/all-over-print-youth-recycled-sports-jersey`,
  },
  {
    key: "hockey-recycled", sport: "hockey", label: "Recycled hockey jersey", audience: "adult",
    title: "All-Over Print Recycled Hockey Fan Jersey", printfulProductId: 730, placements: [...SLEEVED, "yoke"],
    dashboardUrl: `${DASH}/mens/long-sleeve-shirts/all-over-print-recycled-hockey-fan-jersey`,
  },
];

export const DEFAULT_PRINTFILE = { width: 4500, height: 5400 }; // replaced by synced sizes

export function productByKey(key: string): ProductDef | undefined {
  return PRODUCTS.find((p) => p.key === key);
}
export function productsForSport(sport: Sport) {
  return PRODUCTS.filter((p) => p.sport === sport);
}
// the adult product a design defaults to for a sport
export function defaultProduct(sport: Sport): ProductDef {
  return PRODUCTS.find((p) => p.sport === sport && p.audience === "adult")!;
}

export const MARKUP_CENTS = 2000; // price = Printful cost + $20

export function isSport(v: unknown): v is Sport {
  return typeof v === "string" && (SPORTS as readonly string[]).includes(v);
}
