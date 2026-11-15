// Central place for configuration. Server-only values must never be imported
// into client components.
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const env = {
  siteUrl: () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  supabaseUrl: () => req("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => req("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceKey: () => req("SUPABASE_SERVICE_ROLE_KEY"),
  openrouterKey: () => req("OPENROUTER_API_KEY"),
  // Chat model that turns the conversation into a structured jersey spec.
  chatModel: () => process.env.OPENROUTER_CHAT_MODEL ?? "anthropic/claude-sonnet-4.5",
  // Image model for text-free artwork and logos.
  imageModel: () => process.env.OPENROUTER_IMAGE_MODEL ?? "google/gemini-2.5-flash-image",
  printfulToken: () => req("PRINTFUL_API_TOKEN"),
  printfulStoreId: () => process.env.PRINTFUL_STORE_ID,
  // When false, Printful orders are created as drafts for manual review.
  printfulAutoConfirm: () => process.env.PRINTFUL_AUTO_CONFIRM === "true",
  stripeSecret: () => req("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: () => req("STRIPE_WEBHOOK_SECRET"),
  // Flat shipping charged at checkout, in cents (Printful shipping is billed to you).
  shippingCents: () => Number(process.env.SHIPPING_FLAT_CENTS ?? 799),
  adminSecret: () => req("ADMIN_SECRET"),
  anonFreeGenerations: () => Number(process.env.ANON_FREE_GENERATIONS ?? 5),
};
