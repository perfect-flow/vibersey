import "server-only";
import { createHash } from "crypto";
import { pf, getProduct } from "./printful";
import { renderPanels } from "./printfile";
import { uploadPublic } from "./images";
import { cleanPlayer, type DesignSpec, type Player } from "./design-spec";
import { supabaseAdmin } from "./supabase/admin";

// "See it on a model": Printful's mockup generator dresses its product photos
// (models, flat lays) in our print files.

export type MockupImage = { url: string; title: string };
export type MockupResult = { status: "pending" | "completed" | "failed"; images: MockupImage[]; error?: string };

const MODEL_GROUP = /\b(men'?s|women'?s|unisex|kids?|youth|lifestyle|model|person|on[- ]figure)\b/i;
const CACHE_HOURS = 72; // Printful's mockup links are temporary

export class MockupError extends Error {
  constructor(message: string, public status = 500) {
    super(message);
  }
}

export function mockupKey(spec: DesignSpec, player: Player) {
  return createHash("sha1").update(JSON.stringify({ spec, player })).digest("hex").slice(0, 24);
}

const cachePath = (key: string) => `mockups/${key}.json`;

export async function cachedMockups(key: string): Promise<MockupImage[] | null> {
  const { data } = await supabaseAdmin().storage.from("printfiles").download(cachePath(key));
  if (!data) return null;
  try {
    const j = JSON.parse(await data.text()) as { at: number; images: MockupImage[] };
    return Date.now() - j.at < CACHE_HOURS * 3600_000 && j.images.length ? j.images : null;
  } catch {
    return null;
  }
}

async function saveCache(key: string, images: MockupImage[]) {
  await supabaseAdmin()
    .storage.from("printfiles")
    .upload(cachePath(key), Buffer.from(JSON.stringify({ at: Date.now(), images })), { contentType: "application/json", upsert: true });
}

type PrintfileInfo = { option_groups?: string[]; options?: string[] };

// Start a mockup task for one design and return Printful's task key.
export async function startMockup(spec: DesignSpec, player: Player): Promise<string> {
  const product = await getProduct(spec.product);
  if (!product?.printful_product_id || !product.variants?.length)
    throw new MockupError("Model previews will be available once this jersey is synced with Printful.", 503);

  // a middle adult size reads best on the models
  const variant =
    product.variants.find((v) => /^(M|L)$/i.test(v.size)) ?? product.variants[Math.floor(product.variants.length / 2)];
  const info = await pf<PrintfileInfo>(`/mockup-generator/printfiles/${product.printful_product_id}`).catch(() => ({}) as PrintfileInfo);
  const modelGroups = (info.option_groups ?? []).filter((g) => MODEL_GROUP.test(g));

  // smaller files than the real print run: plenty for a 1000px mockup, and fast
  const panels = await renderPanels(spec, cleanPlayer(player), product, 0.35);
  const files = await Promise.all(
    panels.map(async (p) => ({
      placement: p.placement,
      image_url: await uploadPublic("printfiles", p.png, "image/png", "mockup-src/"),
      position: { area_width: p.dims.width, area_height: p.dims.height, width: p.dims.width, height: p.dims.height, top: 0, left: 0 },
    }))
  );

  try {
    const task = await pf<{ task_key: string }>(`/mockup-generator/create-task/${product.printful_product_id}`, {
      method: "POST",
      body: JSON.stringify({
        variant_ids: [variant.id],
        format: "jpg",
        width: 1000,
        files,
        ...(modelGroups.length ? { option_groups: modelGroups } : {}),
      }),
    });
    return task.task_key;
  } catch (e) {
    if (/Printful 429/.test((e as Error).message))
      throw new MockupError("Lots of people are previewing right now. Please try again in a minute.", 429);
    throw e;
  }
}

type PfTask = {
  status: "pending" | "completed" | "failed";
  error?: string;
  mockups?: { placement: string; mockup_url: string; extra?: { title?: string; option?: string; option_group?: string; url: string }[] }[];
};

export async function checkMockup(taskKey: string, cacheKey: string | null): Promise<MockupResult> {
  const t = await pf<PfTask>(`/mockup-generator/task?task_key=${encodeURIComponent(taskKey)}`);
  if (t.status === "pending") return { status: "pending", images: [] };
  if (t.status === "failed") return { status: "failed", images: [], error: t.error ?? "Printful couldn't make the preview." };

  const images: MockupImage[] = [];
  const seen = new Set<string>();
  const add = (url: string, title: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    images.push({ url, title });
  };
  // on-model shots first, then the rest (flat lays, ghost views)
  const all = (t.mockups ?? []).flatMap((m) => [
    { url: m.mockup_url, title: label(m.placement), group: "" },
    ...(m.extra ?? []).map((x) => ({ url: x.url, title: [x.option_group, x.title ?? x.option].filter(Boolean).join(" · "), group: x.option_group ?? "" })),
  ]);
  for (const x of all.filter((x) => MODEL_GROUP.test(x.group) || MODEL_GROUP.test(x.title))) add(x.url, x.title);
  for (const x of all) add(x.url, x.title);
  if (cacheKey && images.length) await saveCache(cacheKey, images).catch(() => {});
  return { status: "completed", images };
}

function label(placement: string) {
  return placement.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
