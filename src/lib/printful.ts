import "server-only";
import { env } from "./env";
import { PRODUCTS, productByKey, type Placement, type ProductKey } from "./catalog";
import { supabaseAdmin } from "./supabase/admin";

const BASE = "https://api.printful.com";

let storeIdCache: string | null = null;

// Account-level tokens need a store id on most endpoints. Use PRINTFUL_STORE_ID
// when set, otherwise the first store on the account.
async function storeId(): Promise<string | null> {
  if (env.printfulStoreId()) return env.printfulStoreId()!;
  if (storeIdCache) return storeIdCache;
  const res = await fetch(`${BASE}/stores`, { headers: { Authorization: `Bearer ${env.printfulToken()}` }, cache: "no-store" });
  if (!res.ok) return null; // store-level tokens can't list stores and don't need an id
  const stores = ((await res.json()).result ?? []) as { id: number; name: string }[];
  storeIdCache = stores[0] ? String(stores[0].id) : null;
  return storeIdCache;
}

async function pf<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.printfulToken()}`,
    "Content-Type": "application/json",
  };
  const store = await storeId();
  if (store) headers["X-PF-Store-Id"] = store;
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...headers, ...(init.headers as object) }, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Printful ${res.status} ${path}: ${JSON.stringify(body).slice(0, 400)}`);
  return body.result as T;
}

export type ProductRow = {
  key: ProductKey;
  sport: string;
  printful_product_id: number;
  title: string;
  audience: "adult" | "youth";
  // youth sizes are stored as "Youth S" etc. so they never collide with adult sizes
  variants: { id: number; size: string; color: string; cost: number }[];
  printfiles: Partial<Record<Placement, { width: number; height: number; dpi: number }>>;
  mockup_image: string | null;
};

type PfProductList = { id: number; title: string; type: string; image: string }[];

// Look up every product in PRODUCTS (by id, or by exact title) and cache its
// sizes, costs and print-file dimensions in the `products` table.
export async function syncCatalog() {
  const all = await pf<PfProductList>("/products");
  const out: { key: ProductKey; ok: boolean; detail: string }[] = [];
  for (const def of PRODUCTS) {
    try {
      let id = def.printfulProductId;
      if (!id) {
        const want = def.title.toLowerCase();
        const match = all.find((p) => p.title.toLowerCase() === want) ?? all.find((p) => p.title.toLowerCase().includes(want));
        if (!match) throw new Error(`No Printful product titled "${def.title}"`);
        id = match.id;
      }
      const prod = await pf<{
        product: { id: number; title: string; image: string };
        variants: { id: number; size: string; color: string; price: string }[];
      }>(`/products/${id}`);
      const pfiles = await pf<{
        printfiles: { printfile_id: number; width: number; height: number; dpi: number }[];
        variant_printfiles: { variant_id: number; placements: Record<string, number> }[];
      }>(`/mockup-generator/printfiles/${id}`);

      const byId = new Map(pfiles.printfiles.map((p) => [p.printfile_id, p]));
      const placements = pfiles.variant_printfiles[0]?.placements ?? {};
      const printfiles: ProductRow["printfiles"] = {};
      for (const pl of def.placements) {
        const f = byId.get(placements[pl]);
        if (f) printfiles[pl] = { width: f.width, height: f.height, dpi: f.dpi };
      }
      const row: ProductRow = {
        key: def.key,
        sport: def.sport,
        printful_product_id: id,
        title: prod.product.title,
        audience: def.audience,
        variants: prod.variants.map((v) => ({
          id: v.id,
          size: def.audience === "youth" ? `Youth ${v.size}` : v.size,
          color: v.color,
          cost: Math.round(parseFloat(v.price) * 100),
        })),
        printfiles,
        mockup_image: prod.product.image ?? null,
      };
      const { error } = await supabaseAdmin().from("products").upsert({ ...row, synced_at: new Date().toISOString() });
      if (error) throw error;
      const missing = def.placements.filter((pl) => !printfiles[pl]);
      out.push({
        key: def.key,
        ok: missing.length === 0,
        detail: `${row.title} (#${id}), ${row.variants.length} variants${
          missing.length ? `; no print file for ${missing.join(", ")} (Printful placements: ${Object.keys(placements).join(", ")})` : ""
        }`,
      });
    } catch (e) {
      out.push({ key: def.key, ok: false, detail: (e as Error).message });
    }
  }
  return out;
}

export async function getProduct(key: string): Promise<ProductRow | null> {
  const { data } = await supabaseAdmin().from("products").select("*").eq("key", key).maybeSingle();
  return (data as ProductRow) ?? null;
}

// The design's product plus its youth version, so teams can mix sizes.
export async function getOrderableProducts(key: string): Promise<ProductRow[]> {
  const def = productByKey(key);
  const keys = [key, def?.youthKey].filter((k): k is ProductKey => !!k);
  const { data } = await supabaseAdmin().from("products").select("*").in("key", keys);
  const rows = (data ?? []) as ProductRow[];
  return keys.map((k) => rows.find((r) => r.key === k)).filter((r): r is ProductRow => !!r);
}

export type Recipient = {
  name: string;
  address1: string;
  address2?: string | null;
  city: string;
  state_code?: string | null;
  country_code: string;
  zip: string;
  email?: string | null;
  phone?: string | null;
};

export async function createOrder(opts: {
  externalId: string;
  recipient: Recipient;
  items: { variant_id: number; quantity: number; retail_price: string; name: string; files: { type: string; url: string }[] }[];
}) {
  const confirm = env.printfulAutoConfirm() ? "?confirm=true" : "";
  return pf<{ id: number; status: string }>(`/orders${confirm}`, {
    method: "POST",
    body: JSON.stringify({ external_id: opts.externalId, recipient: opts.recipient, items: opts.items }),
  });
}
