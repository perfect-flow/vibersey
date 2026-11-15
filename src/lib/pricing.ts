import { MARKUP_CENTS } from "./catalog";

export function priceCents(costCents: number) {
  return costCents + MARKUP_CENTS;
}

export function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

// Printful variant sizes are strings like "S" or "2XL". Pick the variant for a size.
export function variantForSize<T extends { size: string }>(variants: T[], size: string) {
  const norm = (s: string) => s.trim().toUpperCase().replace(/^XXL$/, "2XL").replace(/^XXXL$/, "3XL");
  return variants.find((v) => norm(v.size) === norm(size)) ?? null;
}
