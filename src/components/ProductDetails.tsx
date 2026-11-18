"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ProductDetails, SizeTable } from "@/lib/product-details";
import { fmt } from "@/lib/pricing";

type Prices = { size: string; price: number }[];
type Resp = { details: ProductDetails; youth: ProductDetails | null };

// Fetched once per jersey per page load.
const cache = new Map<string, Promise<Resp>>();
function load(key: string): Promise<Resp> {
  if (!cache.has(key)) {
    const p = fetch(`/api/products/${key}/details`).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Product details aren't available right now.");
      return j as Resp;
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return cache.get(key)!;
}

// The "Details" pop-up for a jersey in the jersey type list.
export function ProductDetailsModal({
  productKey,
  label,
  prices,
  youthPrices,
  isCurrent,
  onClose,
  onDesign,
}: {
  productKey: string;
  label: string;
  prices: Prices;
  youthPrices: Prices;
  isCurrent: boolean;
  onClose: () => void;
  onDesign: () => void;
}) {
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState(0);
  const [unit, setUnit] = useState<"inches" | "cm">("inches");
  const [who, setWho] = useState<"adult" | "youth">("adult");

  useEffect(() => {
    let live = true;
    load(productKey).then(
      (d) => live && setData(d),
      (e) => live && setError((e as Error).message)
    );
    return () => {
      live = false;
    };
  }, [productKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const d = data?.details;
  const shown = who === "youth" && data?.youth ? data.youth : d;
  const shownPrices = who === "youth" ? youthPrices : prices;
  const pic = d?.photos[photo];

  // portal to <body>: the jersey list is sticky, which would trap the overlay
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4" onClick={onClose}>
      <div
        className="card relative my-8 w-full max-w-4xl bg-panel p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${label} details`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl tracking-wide">{label}</h2>
            {d?.brandModel && <p className="text-xs text-muted">{d.brandModel}</p>}
          </div>
          <button className="text-sm text-muted underline" onClick={onClose}>
            Close
          </button>
        </div>

        {error ? (
          <p className="py-16 text-center text-red-400">{error}</p>
        ) : !d ? (
          <div className="py-16 text-center text-muted">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-line border-t-[var(--color-volt)]" />
            Loading details…
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
            {/* photos */}
            <div className="min-w-0">
              {pic && <Photo p={pic} className="aspect-square w-full rounded-xl" />}
              {d.photos.length > 1 && (
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {d.photos.map((p, i) => (
                    <button
                      key={p.url}
                      onClick={() => setPhoto(i)}
                      aria-label={p.title}
                      className={`shrink-0 overflow-hidden rounded-lg border-2 ${i === photo ? "border-[var(--color-volt)]" : "border-transparent"}`}
                    >
                      <Photo p={p} className="h-16 w-16" />
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-muted">Shown blank. Your design prints over the whole jersey.</p>
            </div>

            {/* facts */}
            <div className="min-w-0 space-y-4 text-sm">
              {d.intro.map((t, i) => (
                <p key={i} className="text-white/90">
                  {t}
                </p>
              ))}
              {d.features.length > 0 && (
                <div>
                  <h3 className="label">Material and quality</h3>
                  <ul className="list-disc space-y-1 pl-5 text-white/90">
                    {d.features.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
                {d.availableSizes.length > 0 && <span>Sizes {d.availableSizes[0]}–{d.availableSizes[d.availableSizes.length - 1]}{data?.youth ? ", youth sizes too" : ""}</span>}
                {d.fulfillmentDays != null && <span>Made to order in about {d.fulfillmentDays} business days, then shipped</span>}
              </div>
              {d.notes.length > 0 && (
                <div className="space-y-1 text-xs text-muted">
                  {d.notes.map((n, i) => (
                    <p key={i}>{n}</p>
                  ))}
                </div>
              )}
              <button className="btn-primary w-full sm:w-auto" onClick={isCurrent ? onClose : onDesign}>
                {isCurrent ? "Keep designing" : "Design this jersey"}
              </button>
            </div>

            {/* size guide */}
            <div className="min-w-0 md:col-span-2">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-2xl tracking-wide">Size guide</h3>
                <div className="flex gap-2">
                  {data?.youth && (
                    <Toggle options={[["adult", "Adult"], ["youth", "Youth"]]} value={who} onChange={(v) => setWho(v as "adult" | "youth")} />
                  )}
                  <Toggle options={[["inches", "in"], ["cm", "cm"]]} value={unit} onChange={(v) => setUnit(v as "inches" | "cm")} />
                </div>
              </div>
              {shown && shown.sizeTables[unit].length ? (
                <div className="space-y-4">
                  {shown.sizeTables[unit].map((t) => (
                    <SizeGrid key={t.kind} t={t} prices={t.kind === "product_measure" ? shownPrices : []} youth={who === "youth"} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted">No size chart for this jersey yet.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// Catalog photos are mostly transparent and meant to sit on their background.
function Photo({ p, className }: { p: ProductDetails["photos"][number]; className: string }) {
  return (
    <div
      className={`${className} bg-white bg-cover bg-center`}
      style={{ backgroundColor: p.background ?? "#ffffff", backgroundImage: p.backgroundImage ? `url(${p.backgroundImage})` : undefined }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.url} alt={p.title} className="h-full w-full object-contain" loading="lazy" />
    </div>
  );
}

function Toggle({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line p-0.5 text-xs">
      {options.map(([v, l]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`rounded-md px-2.5 py-1 font-semibold ${v === value ? "bg-volt text-ink" : "text-muted hover:text-white"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

function SizeGrid({ t, prices, youth }: { t: SizeTable; prices: Prices; youth: boolean }) {
  const priceFor = (s: string) => prices.find((p) => p.size === (youth ? `Youth ${s}` : s))?.price;
  const hasPrices = t.sizes.some((s) => priceFor(s) != null);
  return (
    <div>
      <h4 className="label">
        {t.title}
        {t.unit && t.unit !== "none" ? ` (${t.unit})` : ""}
      </h4>
      {t.description && <p className="mb-2 whitespace-pre-line text-xs text-muted">{t.description}</p>}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      {t.image && (
        // the diagram explains the lettered rows (A, B, ...)
        // eslint-disable-next-line @next/next/no-img-element
        <img src={t.image} alt={`${t.title} diagram`} className="w-40 shrink-0 self-center rounded-lg bg-white p-2 sm:self-start" loading="lazy" />
      )}
      <div className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-max text-left text-xs">
          <thead className="bg-ink/60 text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Size</th>
              {t.sizes.map((s) => (
                <th key={s} className="px-3 py-2 text-center font-semibold text-white">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.rows.map((r) => (
              <tr key={r.label} className="border-t border-line">
                <td className="px-3 py-2 text-muted">{r.label}</td>
                {r.values.map((v, i) => (
                  <td key={i} className="px-3 py-2 text-center">
                    {v}
                  </td>
                ))}
              </tr>
            ))}
            {hasPrices && (
              <tr className="border-t border-line">
                <td className="px-3 py-2 text-muted">Price</td>
                {t.sizes.map((s) => {
                  const p = priceFor(s);
                  return (
                    <td key={s} className="px-3 py-2 text-center font-semibold text-volt">
                      {p != null ? fmt(p) : "–"}
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </div>
    </div>
  );
}
