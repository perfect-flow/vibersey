# Vibersey

Design a custom sports jersey by chatting with AI, then have Printful print and ship it. One player or a whole team.

**Stack:** Next.js (App Router) on Vercel · Supabase (auth, Postgres, storage) · OpenRouter (design chat + image models) · Printful (catalog + fulfillment) · Stripe Checkout.

## How it works

1. **Pick a jersey.** Only the Printful all-over-print jerseys listed in `src/lib/catalog.ts` (`PRODUCTS`) are offered: baseball, basketball (premium, recycled, youth), football (American, boxy), soccer (recycled, youth) and hockey.
2. **Chat with the AI designer.** The chat model (`OPENROUTER_CHAT_MODEL`) turns the conversation into a structured `DesignSpec` (colors, pattern, trim, wordmark, fonts, which panels carry the name and number), following each sport's conventions (`STANDARDS` in `catalog.ts`). When something more creative is needed, it writes a prompt for the image model (`OPENROUTER_IMAGE_MODEL`), which paints **text-free** artwork or a logo. AI logos get their white background knocked out automatically. Customers can also upload a logo or attach an inspiration image.
3. **Names and numbers are drawn by code**, never by the image model, using the bundled fonts in `public/fonts`. `src/lib/render.ts` renders every print panel as SVG; the browser preview and the server-side print files (rendered to PNG with resvg) use the same function. That's what guarantees a team template is the exact same design and fonts for every player, with only the name and number changing.
4. **Free limit.** Anonymous visitors get 5 AI design/edit turns (`ANON_FREE_GENERATIONS`), tracked by a cookie in `anon_sessions`. After that they create a free account (passwordless email link). Their drafts move to the new account automatically.
5. **Pricing** is Printful's variant cost + $20 (`MARKUP_CENTS`), plus flat shipping (`SHIPPING_FLAT_CENTS`).
6. **Teams.** "Team template" snapshots the design into a locked copy. Managers add players by hand or CSV (`name, number, size, quantity, email`), order the whole roster in one checkout, or share a link (`/t/<slug>`) where each player enters their name, number and size and pays for their own. Teams can mix adult and youth sizes when the jersey has a youth version.
7. **Fulfillment.** Stripe's `checkout.session.completed` webhook marks the order paid, then (after responding to Stripe) renders each player's print files, uploads them to Supabase storage and creates the Printful order. With `PRINTFUL_AUTO_CONFIRM=false` orders arrive in Printful as drafts for you to confirm.

## Setup

1. **Supabase:** create a project, run `supabase/migrations/0001_init.sql` in the SQL editor. Under Authentication > URL configuration, add `https://<your-domain>/auth/callback` as a redirect URL.
2. **Env vars:** copy `.env.example` to `.env.local` (and into Vercel project settings) and fill it in.
3. **Catalog sync:** after deploying, pull products, sizes, costs and print-file sizes from Printful:
   ```sh
   curl -X POST -H "Authorization: Bearer $ADMIN_SECRET" https://<your-domain>/api/admin/sync-catalog
   ```
   The response lists each product and flags any whose placements didn't match. Re-run whenever Printful prices change.
4. **Stripe webhook:** add an endpoint for `https://<your-domain>/api/stripe/webhook` with the `checkout.session.completed` event and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
5. **Printful webhook (optional):** point it at `https://<your-domain>/api/printful/webhook?secret=<ADMIN_SECRET>` to track shipped/fulfilled status.
6. **Retry a failed order:** `curl -X POST -H "Authorization: Bearer $ADMIN_SECRET" "https://<your-domain>/api/admin/fulfill?order=<order id>"`.

## Development

```sh
npm install
npm run dev
npx tsx scripts/render-sample.ts   # renders sample print panels to ./tmp-render
```

## Known limits (v1)

- Layout positions are tuned by eye. After the catalog sync, compare a rendered print file against Printful's template for each product and adjust `STANDARDS[...].layout` if needed.
- The preview is a flat silhouette, not a Printful photo mockup.
- Shipping is a flat rate rather than a live Printful quote.
- Very large team orders render print files inside one serverless invocation (up to 300s). A background queue would be the next step past roughly 40 players per order.
