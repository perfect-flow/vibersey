import "server-only";
import { pf, pfV2, getProduct } from "./printful";
import { productByKey, type ProductKey } from "./catalog";
import { supabaseAdmin } from "./supabase/admin";

// The "Details" pop-up in the jersey list: the product facts, photos and size
// guide from the catalog, so shoppers can check fabric, fit and sizing before
// they design. Fetched from Printful once and cached in storage for a week.

export type SizeTable = {
  kind: "product_measure" | "measure_yourself" | "international";
  title: string;
  unit: string;
  description: string; // plain text
  image: string | null;
  sizes: string[];
  rows: { label: string; values: string[] }[]; // one value per size
};

export type DetailPhoto = { url: string; title: string; background: string | null; backgroundImage: string | null };

export type ProductDetails = {
  key: ProductKey;
  name: string;
  brandModel: string | null;
  intro: string[]; // paragraphs
  features: string[]; // bullet points
  notes: string[]; // disclaimers / size notes
  photos: DetailPhoto[];
  sizeTables: Record<"inches" | "cm", SizeTable[]>;
  availableSizes: string[];
  fulfillmentDays: number | null;
  origin: string | null;
};

const CACHE_DAYS = 7;
const VERSION = 2; // bump to drop old caches when the shape changes
const cachePath = (key: string) => `details/${key}.v${VERSION}.json`;

type V1Product = {
  product: {
    id: number;
    title: string;
    brand: string | null;
    model: string | null;
    image: string;
    description: string;
    avg_fulfillment_time?: number | null;
    origin_country?: string | null;
  };
};

type V1Sizes = {
  available_sizes: string[];
  size_tables: {
    type: SizeTable["kind"];
    unit: string;
    description?: string;
    image_url?: string;
    image_description?: string;
    measurements: { type_label: string; values: { size: string; value?: string; min_value?: string; max_value?: string }[] }[];
  }[];
};

type V2Style = { placement: string; mockup_styles: { id: number; category_name: string; view_name: string }[] };
type V2Images = {
  catalog_variant_id: number;
  color: string;
  images: { placement: string; image_url: string; background_color: string | null; background_image: string | null; mockup_style_id?: number }[];
}[];

// Shoppers buy from Vibersey, so the supplier's name never shows.
function scrub(s: string) {
  return s
    .replace(/\bprintful('s)?\b/gi, "our")
    .replace(/\bour our\b/gi, "our")
    .trim();
}

function htmlToText(html: string) {
  return scrub(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|li|div|h\d)>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
      .replace(/&Prime;/g, "″")
      .replace(/&prime;/g, "′")
      .replace(/&ndash;/g, "–")
      .replace(/&mdash;/g, "—")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/\n{3,}/g, "\n\n")
  );
}

// Printful descriptions are a paragraph or two, then "• " bullet lines, then
// notes such as "This product is made on demand...". Split them apart.
export function splitDescription(text: string) {
  const intro: string[] = [];
  const features: string[] = [];
  const notes: string[] = [];
  let seenBullets = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = scrub(raw.trim());
    if (!line) continue;
    const bullet = line.match(/^[•*\-–]\s*(.+)$/);
    if (bullet) {
      features.push(bullet[1].trim());
      seenBullets = true;
    } else if (/^(disclaimer|size guide|note|important|please)/i.test(line) || seenBullets) notes.push(line.replace(/^disclaimer:\s*/i, ""));
    else intro.push(line);
  }
  return { intro, features, notes };
}

const TABLE_TITLES: Record<SizeTable["kind"], string> = {
  product_measure: "Jersey measurements",
  measure_yourself: "Body measurements",
  international: "International sizes",
};

function sizeTables(raw: V1Sizes, unit: string): SizeTable[] {
  // youth sizes come back as numbers (8, 10, ...)
  const sizes = (raw.available_sizes ?? []).map(String);
  return (raw.size_tables ?? [])
    .filter((t) => t.unit === unit || t.type === "international" || t.unit === "none")
    .map((t) => ({
      kind: t.type,
      title: TABLE_TITLES[t.type] ?? "Sizes",
      unit: t.unit,
      description: t.description ? htmlToText(t.description) : "",
      image: t.image_url || null,
      sizes,
      rows: t.measurements.map((m) => ({
        label: m.type_label,
        values: sizes.map((s) => {
          const v = m.values.find((x) => String(x.size) === s);
          if (!v) return "–";
          if (v.value != null) return v.value;
          return v.min_value != null && v.max_value != null ? `${v.min_value}–${v.max_value}` : (v.min_value ?? v.max_value ?? "–");
        }),
      })),
    }))
    .sort((a, b) => order(a.kind) - order(b.kind));
}
const order = (k: SizeTable["kind"]) => ({ product_measure: 0, measure_yourself: 1, international: 2 })[k] ?? 3;

const MODEL_STYLE = /\b(model|men'?s|women'?s|kid|youth|lifestyle|person|on[- ]figure)\b/i;

// Photos: the catalog's model / lifestyle shots when it has them, then the
// plain front and back. These are blank (white) jerseys; the design's own
// model photos come from "See it on a model" in the builder.
async function photos(id: number, fallback: string): Promise<DetailPhoto[]> {
  const out: DetailPhoto[] = [];
  const seen = new Set<string>();
  const add = (url: string, title: string, background: string | null = null, backgroundImage: string | null = null) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ url, title, background, backgroundImage });
  };
  try {
    const styles = await pfV2<V2Style[]>(`/v2/catalog-products/${id}/mockup-styles`);
    const all = styles.flatMap((s) => s.mockup_styles.map((m) => ({ ...m, placement: s.placement })));
    const model = all.filter((m) => MODEL_STYLE.test(`${m.category_name} ${m.view_name}`));
    const flat = all.filter((m) => !MODEL_STYLE.test(`${m.category_name} ${m.view_name}`) && /front|back/i.test(m.view_name));
    const pick = [...model.slice(0, 8), ...flat.slice(0, 2)];
    const titles = new Map(pick.map((m) => [m.id, `${m.category_name}${m.view_name ? `, ${m.view_name}` : ""}`]));
    if (pick.length) {
      const data = await pfV2<V2Images>(`/v2/catalog-products/${id}/images?mockup_style_ids=${pick.map((m) => m.id).join(",")}&limit=20`);
      // one color is enough: all-over print jerseys are white blanks
      const first = data[0];
      for (const img of first?.images ?? []) {
        add(img.image_url, (img.mockup_style_id && titles.get(img.mockup_style_id)) || img.placement, img.background_color, img.background_image);
      }
      // lifestyle, then on-model, then flat; fronts before backs
      const rank = (t: string) =>
        (/lifestyle/i.test(t) ? 0 : MODEL_STYLE.test(t) ? 10 : 20) + (/front/i.test(t) ? 0 : /back/i.test(t) ? 2 : 1);
      out.sort((a, b) => rank(a.title) - rank(b.title));
    }
  } catch (e) {
    console.warn("product-details: images failed", id, (e as Error).message);
  }
  if (!out.length) add(fallback, "Jersey");
  return out.slice(0, 10);
}

async function build(key: ProductKey): Promise<ProductDetails> {
  const def = productByKey(key)!;
  const row = await getProduct(key);
  const id = row?.printful_product_id || def.printfulProductId;
  if (!id) throw new Error(`No catalog id for ${key} yet (run the catalog sync)`);
  const [prod, inches, cm] = await Promise.all([
    pf<V1Product>(`/products/${id}`),
    pf<V1Sizes>(`/products/${id}/sizes?unit=inches`).catch(() => null),
    pf<V1Sizes>(`/products/${id}/sizes?unit=cm`).catch(() => null),
  ]);
  const p = prod.product;
  const { intro, features, notes } = splitDescription(p.description ?? "");
  return {
    key,
    name: def.label,
    // in-house blanks carry the supplier's name as the brand, so drop it
    brandModel: [p.brand, p.model].filter((x) => x && !/printful/i.test(x)).join(" ") || null,
    intro,
    features,
    notes,
    photos: await photos(id, p.image),
    sizeTables: { inches: inches ? sizeTables(inches, "inches") : [], cm: cm ? sizeTables(cm, "cm") : [] },
    availableSizes: (inches?.available_sizes ?? cm?.available_sizes ?? []).map(String),
    fulfillmentDays: p.avg_fulfillment_time ?? null,
    origin: p.origin_country ?? null,
  };
}

export async function productDetails(key: ProductKey): Promise<ProductDetails> {
  const db = supabaseAdmin();
  const { data } = await db.storage.from("printfiles").download(cachePath(key));
  if (data) {
    try {
      const j = JSON.parse(await data.text()) as { at: number; details: ProductDetails };
      if (Date.now() - j.at < CACHE_DAYS * 86400_000) return j.details;
    } catch {
      /* rebuild */
    }
  }
  const details = await build(key);
  await db.storage
    .from("printfiles")
    .upload(cachePath(key), Buffer.from(JSON.stringify({ at: Date.now(), details })), { contentType: "application/json", upsert: true })
    .catch(() => null);
  return details;
}
